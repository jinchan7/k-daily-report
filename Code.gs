// グローバル変数
var SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
var SHEET_NAMES = {
  DAILY_REPORT: '日報',
  COMMENTS: 'コメント',
  USERS: 'ユーザー',
  SETTINGS: '設定'
};
var CACHE_EXPIRATION = 60; // 60秒キャッシュ（パフォーマンス改善）

// コメントシートのヘッダー定義
var COMMENT_HEADERS = ['ID', '日報ID', '親コメントID', '作成者', 'コメント内容', '作成日時'];

/**
 * HTMLエスケープを行う関数 - すべてのテンプレートで使用可能
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// メールアドレスから表示名を取得する関数
function getUserDisplayName(email) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  var userData = userSheet.getDataRange().getValues();
  
  // ヘッダー行をスキップして検索
  for (var i = 1; i < userData.length; i++) {
    if (userData[i][0] === email) {
      return userData[i][1] || email.split('@')[0]; // 名前がなければアドレスのローカル部分
    }
  }
  
  return email.split('@')[0]; // ユーザーが見つからない場合
}