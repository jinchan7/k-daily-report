// user_management.gs
function ensureUserExists(email) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  var userData = userSheet.getDataRange().getValues();

  for (var i = 1; i < userData.length; i++) {
    if (userData[i][0] === email) {
      return;
    }
  }

  var userName = email.split('@')[0];
  userSheet.appendRow([email, userName, 'TRUE', '一般']);
}

function isAdmin(email) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  var userData = userSheet.getDataRange().getValues();

  for (var i = 1; i < userData.length; i++) {
    if (userData[i][0] === email && userData[i][3] === '管理者') {
      return true;
    }
  }
  return false;
}

function getUserDisplayName(email) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  var userData = userSheet.getDataRange().getValues();

  for (var i = 1; i < userData.length; i++) {
    if (userData[i][0] === email) {
      return userData[i][1] || email.split('@')[0];
    }
  }

  return email.split('@')[0];
}
