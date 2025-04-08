// setup.gs
function setupSystem() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var sheetNames = sheets.map(function(sheet) { return sheet.getName(); });

  if (sheetNames.indexOf(SHEET_NAMES.DAILY_REPORT) === -1) {
    var reportSheet = ss.insertSheet(SHEET_NAMES.DAILY_REPORT);
    var reportHeaders = ['ID', '作成日時', '作成者', 'やったこと(Y)', 'わかったこと(W)', 'つぎやること(T)', '明日やること', '感想等', 'ステータス', '最終更新日時', '登録日'];
    reportSheet.getRange(1, 1, 1, reportHeaders.length).setValues([reportHeaders]);
    reportSheet.setFrozenRows(1);
  }

  setupCommentSheet(ss, sheetNames);

  if (sheetNames.indexOf(SHEET_NAMES.USERS) === -1) {
    var userSheet = ss.insertSheet(SHEET_NAMES.USERS);
    var userHeaders = ['メールアドレス', '名前', '通知設定', 'ロール'];
    userSheet.getRange(1, 1, 1, userHeaders.length).setValues([userHeaders]);
    userSheet.setFrozenRows(1);
  }

  if (sheetNames.indexOf(SHEET_NAMES.SETTINGS) === -1) {
    var settingSheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
    var settingHeaders = ['設定キー', '設定値', '説明'];
    settingSheet.getRange(1, 1, 1, settingHeaders.length).setValues([settingHeaders]);
    settingSheet.setFrozenRows(1);

    var initialSettings = [
      ['通知メール件名', '新しい日報が投稿されました', '通知メールの件名'],
      ['通知メール本文', '新しい日報が投稿されました。以下のリンクからご確認ください。\n{URL}', '通知メールの本文テンプレート'],
      ['管理者メール', '', '管理者のメールアドレス（複数の場合はカンマ区切り）']
    ];
    settingSheet.getRange(2, 1, initialSettings.length, settingHeaders.length).setValues(initialSettings);
  }

  Logger.log('システムのセットアップが完了しました。');
  Logger.log('次のステップ:');
  Logger.log('1. [公開] > [ウェブ アプリケーションとして導入] を選択');
  Logger.log('2. 適切な公開設定を選択し、[導入] をクリック');
}
