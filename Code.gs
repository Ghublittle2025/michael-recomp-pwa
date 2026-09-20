/**
 * MICHAEL'S RECOMP & HEALTH LOG - GOOGLE APPS SCRIPT WEB APP BACKEND
 * Spreadsheet: "Daily Food & Macro Log"
 * Tabs:
 *   1. "Macro Log": Date, Time, Food, Calories, Protein, Carbs, Fat, Goal Score, Notes
 *   2. "Workout Log": Date, Time, Workout Type, Duration, Calories, Notes
 *   3. "Weekly_Checkins": Date, Weight, Skeletal Muscle Mass, Body Fat Mass, BF%, Score
 */

const SPREADSHEET_ID = '1-2Y65lEPAt6CA6fk1GpN7c_F9A7Zc3YGGB2uFG9l61M';

function getSS() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch(e) {}
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doGet(e) {
  try {
    const ss = getSS();
    const action = (e && e.parameter && e.parameter.action) || 'getDashboardData';
    const targetDate = (e && e.parameter && e.parameter.date) || getTodayDateString();
    
    if (action === 'getDashboardData') {
      const macroSheet = ss.getSheetByName('Macro Log');
      const workoutSheet = ss.getSheetByName('Workout Log');
      const checkinSheet = ss.getSheetByName('Weekly_Checkins');
      
      const macroData = getSheetData(macroSheet);
      const todayMacros = macroData.filter(row => isMatchingDate(row.Date || row['Date'], targetDate));
      
      const workoutData = getSheetData(workoutSheet);
      const checkinData = getSheetData(checkinSheet);
      
      return createJsonResponse({
        status: 'success',
        date: targetDate,
        todayMacros: todayMacros,
        allMacros: macroData.slice(-100), // last 100 entries
        recentWorkouts: workoutData.slice(-20),
        checkins: checkinData
      });
    }

    if (action === 'parseGeminiAI') {
      const userPrompt = e.parameter.prompt || '';
      const systemInstruction = `
      You are Michael's Personal Health Tech AI (6'4", Goal Wt: 220 lbs, Caloric Target: 2,500 kcal, Protein Floor: 210g).
      Guardrails: NO salads, NO lettuce, NO pickles, NO off-plan veggies, NO seafood. Pair red meat with cheddar cheese.
      Return JSON: {"food_name": "string", "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "goal_score": "Grade A (5/5)", "feedback": "string"}
      `;
      
      const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
      if (apiKey) {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
        const resp = UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({ contents: [{ parts: [{ text: systemInstruction + '\nUser Input: ' + userPrompt }] }] })
        });
        const json = JSON.parse(resp.getContentText());
        const rawText = json.candidates[0].content.parts[0].text;
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
          return createJsonResponse({ status: 'success', result: JSON.parse(match[0]) });
        }
      }
    }
    
    return createJsonResponse({ status: 'error', message: 'Invalid action' });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;
    const ss = getSS();
    
    if (action === 'logMeal') {
      const sheet = ss.getSheetByName('Macro Log');
      const now = new Date();
      const dateStr = postData.date || formatDate(now);
      const timeStr = postData.time || formatTime(now);
      
      sheet.appendRow([
        '', // Column A spacer
        dateStr, // Column B: Date
        timeStr, // Column C: Time
        postData.food || '', // Column D: Food / Meal Item
        Number(postData.calories || 0), // Column E: Est. Calories (kcal)
        Number(postData.protein || 0), // Column F: Protein
        Number(postData.carbs || 0), // Column G: Carbs
        Number(postData.fat || 0), // Column H: Fat
        postData.goalScore || 'Grade B (4/5)', // Column I: Goal Score
        postData.notes || postData.feedback || '' // Column J: Score Explanation / Notes
      ]);
      
      return createJsonResponse({ status: 'success', message: 'Meal logged successfully' });
    }

    if (action === 'deleteMeal') {
      const sheet = ss.getSheetByName('Macro Log');
      const foodToDelete = postData.food || '';
      const dateToDelete = postData.date || '';
      const range = sheet.getDataRange();
      const values = range.getValues();
      
      for (let i = values.length - 1; i >= 1; i--) {
        const rowFood = values[i][3]; // Column D
        const rowDate = values[i][1]; // Column B
        if (rowFood === foodToDelete && (dateToDelete === '' || isMatchingDate(rowDate, dateToDelete))) {
          sheet.deleteRow(i + 1);
          return createJsonResponse({ status: 'success', message: 'Meal deleted from sheet' });
        }
      }
      return createJsonResponse({ status: 'warning', message: 'Meal row not found in sheet' });
    }
    
    if (action === 'logWorkout') {
      const sheet = ss.getSheetByName('Workout Log');
      const now = new Date();
      const dateStr = postData.date || formatDate(now);
      const timeStr = postData.time || formatTime(now);
      
      sheet.appendRow([
        '', // Column A spacer
        dateStr,
        timeStr,
        postData.workoutType || '',
        Number(postData.duration || 0),
        Number(postData.calories || 0),
        postData.notes || ''
      ]);
      
      return createJsonResponse({ status: 'success', message: 'Workout logged successfully' });
    }
    
    if (action === 'logCheckin') {
      const sheet = ss.getSheetByName('Weekly_Checkins');
      const dateStr = postData.date || formatDate(new Date());
      
      sheet.appendRow([
        '', // Column A spacer
        dateStr,
        Number(postData.weight || 0),
        Number(postData.smm || 0),
        Number(postData.bfm || 0),
        Number(postData.bfp || 0),
        postData.score || ''
      ]);
      
      return createJsonResponse({ status: 'success', message: 'InBody Checkin logged successfully' });
    }
    
    return createJsonResponse({ status: 'error', message: 'Unknown action' });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

// Helpers
function getSheetData(sheet) {
  if (!sheet) return [];
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length <= 1) return [];

  // Exact header row lookup: cell B5 is exactly 'Date' or 'Time' or 'Protein' (skips top title banner)
  let headerIndex = values.findIndex(function(r) {
    return r.some(function(c) {
      const s = String(c).trim().toLowerCase();
      return s === 'date' || s === 'time' || s === 'food / meal item' || s === 'est. calories (kcal)' || s === 'protein';
    });
  });

  if (headerIndex === -1) {
    headerIndex = values.findIndex(function(r) { return r.filter(function(c) { return String(c).trim() !== ''; }).length >= 3; });
  }
  if (headerIndex === -1) headerIndex = 0;

  const headers = values[headerIndex].map(function(h) { return String(h).trim(); });
  const rows = values.slice(headerIndex + 1);

  return rows.map(function(row) {
    let obj = {};
    headers.forEach(function(header, index) {
      if (!header) return;
      let val = row[index];
      if (val instanceof Date) { val = formatDate(val); }
      obj[header] = val;
    });
    return obj;
  });
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(d) {
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${mins}`;
}

function getTodayDateString() {
  try {
    return Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  } catch(e) {
    return formatDate(new Date());
  }
}

function normalizeDateStr(dateVal) {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    return formatDate(dateVal);
  }
  const str = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }
  // Handles M/D/YYYY or MM/DD/YYYY
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const month = m[1].padStart(2, '0');
    const day = m[2].padStart(2, '0');
    const year = m[3];
    return `${year}-${month}-${day}`;
  }
  return str;
}

function isMatchingDate(dateVal, targetDate) {
  if (!dateVal) return false;
  const normalizedVal = normalizeDateStr(dateVal);
  const normalizedTarget = normalizeDateStr(targetDate);
  return normalizedVal === normalizedTarget;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
