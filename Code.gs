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

// 日報作成権限があるかどうかの確認
function canCreateReport(email) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  var userData = userSheet.getDataRange().getValues();
  
  for (var i = 1; i < userData.length; i++) {
    if (userData[i][0] === email) {
      var role = userData[i][3]; // ロール列
      return role === '管理者' || role === '作成者'; // 管理者か作成者のみ作成可能
    }
  }
  return false; // 該当ユーザーが見つからない場合
}

// システムの初期設定を行う関数
function setupSystem() {
  // スプレッドシートを取得
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 既存のシートをすべて取得
  var sheets = ss.getSheets();
  var sheetNames = sheets.map(function(sheet) { return sheet.getName(); });
  
  // 日報シートの作成（存在しない場合）- 現在のスプレッドシート構造に合わせる
  if (sheetNames.indexOf(SHEET_NAMES.DAILY_REPORT) === -1) {
    var reportSheet = ss.insertSheet(SHEET_NAMES.DAILY_REPORT);
    var reportHeaders = ['ID', '作成日時', '作成者', 'やったこと(Y)', 'わかったこと(W)', 
                        'つぎやること(T)', '明日やること', '感想等', 'ステータス', '最終更新日時', '登録日'];
    reportSheet.getRange(1, 1, 1, reportHeaders.length).setValues([reportHeaders]);
    reportSheet.setFrozenRows(1);
  }
  
  // コメントシートの作成（存在しない場合）または修正
  setupCommentSheet(ss, sheetNames);
  
  // ユーザーシートの作成（存在しない場合）
  if (sheetNames.indexOf(SHEET_NAMES.USERS) === -1) {
    var userSheet = ss.insertSheet(SHEET_NAMES.USERS);
    var userHeaders = ['メールアドレス', '名前', '通知設定', 'ロール'];
    userSheet.getRange(1, 1, 1, userHeaders.length).setValues([userHeaders]);
    userSheet.setFrozenRows(1);
  }
  
  // 設定シートの作成（存在しない場合）
  if (sheetNames.indexOf(SHEET_NAMES.SETTINGS) === -1) {
    var settingSheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
    var settingHeaders = ['設定キー', '設定値', '説明'];
    settingSheet.getRange(1, 1, 1, settingHeaders.length).setValues([settingHeaders]);
    settingSheet.setFrozenRows(1);
    
    // 初期設定を追加
    var initialSettings = [
      ['通知メール件名', '新しい日報が投稿されました', '通知メールの件名'],
      ['通知メール本文', '新しい日報が投稿されました。以下のリンクからご確認ください。\n{URL}', '通知メールの本文テンプレート'],
      ['管理者メール', '', '管理者のメールアドレス（複数の場合はカンマ区切り）']
    ];
    settingSheet.getRange(2, 1, initialSettings.length, settingHeaders.length).setValues(initialSettings);
  }
  
  // WebアプリとしてGASを公開するための説明をログに表示
  Logger.log('システムのセットアップが完了しました。');
  Logger.log('次のステップ:');
  Logger.log('1. [公開] > [ウェブ アプリケーションとして導入] を選択');
  Logger.log('2. 適切な公開設定を選択し、[導入] をクリック');
}

// コメントシートのセットアップや修正を行う関数
function setupCommentSheet(ss, sheetNames) {
  var commentSheet;
  
  // シートが存在しない場合は新規作成
  if (sheetNames.indexOf(SHEET_NAMES.COMMENTS) === -1) {
    commentSheet = ss.insertSheet(SHEET_NAMES.COMMENTS);
    commentSheet.getRange(1, 1, 1, COMMENT_HEADERS.length).setValues([COMMENT_HEADERS]);
    commentSheet.setFrozenRows(1);
    Logger.log('コメントシートを新規作成しました');
    return;
  }
  
  // 既存のシートを取得
  commentSheet = ss.getSheetByName(SHEET_NAMES.COMMENTS);
  var headerRow = commentSheet.getRange(1, 1, 1, commentSheet.getLastColumn()).getValues()[0];
  
  // 必要なヘッダーが存在するか確認
  var missingHeaders = [];
  for (var i = 0; i < COMMENT_HEADERS.length; i++) {
    if (headerRow.indexOf(COMMENT_HEADERS[i]) === -1) {
      missingHeaders.push(COMMENT_HEADERS[i]);
    }
  }
  
  // 不足しているヘッダーがある場合は修正
  if (missingHeaders.length > 0) {
    // 既存のデータをバックアップ
    var existingData = [];
    if (commentSheet.getLastRow() > 1) {
      existingData = commentSheet.getRange(2, 1, commentSheet.getLastRow() - 1, commentSheet.getLastColumn()).getValues();
    }
    
    // シートをクリアして正しいヘッダーで再作成
    commentSheet.clear();
    commentSheet.getRange(1, 1, 1, COMMENT_HEADERS.length).setValues([COMMENT_HEADERS]);
    commentSheet.setFrozenRows(1);
    
    // 既存データがあれば、新しい構造に合わせて復元
    if (existingData.length > 0) {
      var newData = [];
      for (var i = 0; i < existingData.length; i++) {
        var row = [];
        // 新しいヘッダー構造に合わせてデータを配置
        for (var j = 0; j < COMMENT_HEADERS.length; j++) {
          var oldIndex = headerRow.indexOf(COMMENT_HEADERS[j]);
          if (oldIndex !== -1 && oldIndex < existingData[i].length) {
            row.push(existingData[i][oldIndex]);
          } else {
            row.push(''); // データがない場合は空文字を設定
          }
        }
        newData.push(row);
      }
      
      // データを書き込み
      if (newData.length > 0) {
        commentSheet.getRange(2, 1, newData.length, COMMENT_HEADERS.length).setValues(newData);
      }
    }
    
    Logger.log('コメントシートのヘッダーを修正しました: ' + missingHeaders.join(', '));
  } else {
    Logger.log('コメントシートの構造は正常です');
  }
}

// 日報シートのカラム構造を更新する関数（登録日カラムの追加）
function updateReportSheetColumns() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var reportSheet = ss.getSheetByName(SHEET_NAMES.DAILY_REPORT);
  var headers = reportSheet.getRange(1, 1, 1, reportSheet.getLastColumn()).getValues()[0];
  
  // 登録日カラムが存在するか確認
  if (headers.indexOf('登録日') === -1) {
    // 登録日カラムを追加
    var lastCol = reportSheet.getLastColumn() + 1;
    reportSheet.getRange(1, lastCol).setValue('登録日');
    
    // 既存データには作成日時を登録日として設定
    if (reportSheet.getLastRow() > 1) {
      var createdAtIndex = headers.indexOf('作成日時');
      if (createdAtIndex !== -1) {
        var createdDates = reportSheet.getRange(2, createdAtIndex + 1, reportSheet.getLastRow() - 1, 1).getValues();
        reportSheet.getRange(2, lastCol, createdDates.length, 1).setValues(createdDates);
      }
    }
    
    Logger.log('日報シートに登録日カラムを追加しました');
  }
}

// コメントシートを確認して修正する関数（手動実行用）
function checkAndFixCommentSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  setupCommentSheet(ss, [SHEET_NAMES.COMMENTS]);
  return "コメントシートのチェックと修正が完了しました";
}

// 日報シートを確認して修正する関数（手動実行用）
function checkAndFixReportSheet() {
  updateReportSheetColumns();
  return "日報シートのチェックと修正が完了しました";
}