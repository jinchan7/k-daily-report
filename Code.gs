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

// Webアプリとしてアクセスされたときの処理
function doGet(e) {
  var user = Session.getActiveUser().getEmail();
  var action = e.parameter.action || 'view';
  
  // ユーザー情報を取得・登録
  ensureUserExists(user);
  
  // 日報シートの構造を確認・更新（登録日カラムの追加）
  updateReportSheetColumns();
  
  // 管理者画面へのルーティング
  if (action === 'admin') {
    // 管理者権限チェック
    if (!isAdmin(user)) {
      // 権限がない場合は一覧画面にリダイレクト
      var template = HtmlService.createTemplateFromFile('view');
      template.reports = getReports(e.parameter);
      template.searchParam = e.parameter.search || '';
      template.authorParam = e.parameter.author || '';
      template.startDateParam = e.parameter.startDate || '';
      template.endDateParam = e.parameter.endDate || '';
      template.errorMessage = '管理者権限がありません。';
    } else {
      var template = HtmlService.createTemplateFromFile('admin');
      template.user = user;
      template.userName = getUserDisplayName(user);
      template.SPREADSHEET_ID = SPREADSHEET_ID;
      template.CACHE_EXPIRATION = CACHE_EXPIRATION;
      template.isAdmin = isAdmin(user);
      template.canCreate = canCreateReport(user);
      
      var htmlOutput = template.evaluate()
                              .setTitle('新任職員日報システム - 管理画面')
                              .addMetaTag('viewport', 'width=device-width, initial-scale=1')
                              .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      return htmlOutput;
    }
  }
  
  // システム初期化チェック（コメントシートなどの構造を確認）
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheetNames = ss.getSheets().map(function(sheet) { return sheet.getName(); });
  setupCommentSheet(ss, sheetNames);
  
  var template;
  
  // 新規作成時の権限チェック
  if (action === 'new' && !canCreateReport(user)) {
    // 権限がない場合は一覧画面にリダイレクト
    template = HtmlService.createTemplateFromFile('view');
    template.reports = getReports(e.parameter);
    template.searchParam = e.parameter.search || '';
    template.authorParam = e.parameter.author || '';
    template.startDateParam = e.parameter.startDate || '';
    template.endDateParam = e.parameter.endDate || '';
    template.errorMessage = '日報作成権限がありません。管理者にお問い合わせください。';
  } else if (action === 'new' || action === 'edit') {
    // 日報入力・編集画面
    template = HtmlService.createTemplateFromFile('form');
    if (action === 'edit' && e.parameter.id) {
      template.report = getReportById(e.parameter.id);
    } else {
      template.report = null;
    }
  } else if (action === 'detail' && e.parameter.id) {
    // 日報詳細画面
    template = HtmlService.createTemplateFromFile('detail');
    template.report = getReportById(e.parameter.id);
    template.comments = getCommentsByReportId(e.parameter.id);
  } else {
    // 一覧表示画面（デフォルト）
    template = HtmlService.createTemplateFromFile('view');
    template.reports = getReports(e.parameter);
    template.searchParam = e.parameter.search || '';
    template.authorParam = e.parameter.author || '';
    template.startDateParam = e.parameter.startDate || '';
    template.endDateParam = e.parameter.endDate || '';
    template.errorMessage = '';
  }
  
  // 共通データ
  template.user = user;
  template.isAdmin = isAdmin(user);
  template.canCreate = canCreateReport(user);
  template.userName = getUserDisplayName(user);
  
  // テンプレートをスタンドアロンで評価
  var htmlOutput = template.evaluate()
                          .setTitle('新任職員日報システム')
                          .addMetaTag('viewport', 'width=device-width, initial-scale=1')
                          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return htmlOutput;
}

// HTMLファイルを含める関数（テンプレート内で使用）
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ユーザーの存在確認・登録
function ensureUserExists(email) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  var userData = userSheet.getDataRange().getValues();
  
  // ヘッダー行をスキップして検索
  for (var i = 1; i < userData.length; i++) {
    if (userData[i][0] === email) {
      return; // ユーザーが存在する
    }
  }
  
  // ユーザーが存在しない場合は追加
  var userName = email.split('@')[0]; // 仮の名前としてメールアドレスの@前を使用
  userSheet.appendRow([email, userName, 'TRUE', '一般']);
}

// 管理者かどうかの確認
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

// Code.gs の saveReport 関数修正
// レコード重複問題を解消するための修正版

function saveReport(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var reportSheet = ss.getSheetByName(SHEET_NAMES.DAILY_REPORT);
    var reportData = reportSheet.getDataRange().getValues();
    var headers = reportData[0];
    var now = new Date();
    
    // デバッグログの強化
    Logger.log('=========== saveReport 開始 ===========');
    Logger.log('リクエスト: ID=' + (data.id || '新規') + ', 作成者=' + Session.getActiveUser().getEmail());
    
    // ヘッダー行のインデックスを取得
    var idIndex = headers.indexOf('ID');
    var createdAtIndex = headers.indexOf('作成日時');
    var authorIndex = headers.indexOf('作成者');
    var yIndex = headers.indexOf('やったこと(Y)');
    var wIndex = headers.indexOf('わかったこと(W)');
    var tIndex = headers.indexOf('つぎやること(T)');
    var nextIndex = headers.indexOf('明日やること');
    var commentIndex = headers.indexOf('感想等');
    var statusIndex = headers.indexOf('ステータス');
    var updatedAtIndex = headers.indexOf('最終更新日時');
    var reportDateIndex = headers.indexOf('登録日');
    
    // HTMLエスケープ処理
    data.y = escapeHtml(data.y || '');
    data.w = escapeHtml(data.w || '');
    data.t = escapeHtml(data.t || '');
    data.next = escapeHtml(data.next || '');
    data.comment = escapeHtml(data.comment || '');
    
    // === 編集（更新）の場合 ===
    if (data.id && data.id.trim() !== '') {
      Logger.log('既存日報の更新処理開始: ID=' + data.id);
      var foundRow = -1;
      
      // ★★★ 修正: IDでレコードを厳密に検索（データ型に注意） ★★★
      for (var i = 1; i < reportData.length; i++) {
        // IDの型をログに出力
        if (i < 5) { // 最初の数行だけ出力
          Logger.log('行=' + (i+1) + ', ID型=' + typeof reportData[i][idIndex] + 
                    ', 値=' + reportData[i][idIndex] + 
                    ', 比較結果=' + (reportData[i][idIndex] === data.id));
        }
        
        // 文字列に変換して比較（厳密化）
        var rowId = String(reportData[i][idIndex]);
        if (rowId === data.id) {
          foundRow = i;
          Logger.log('一致する行を発見: 行=' + (i+1) + ', ID=' + data.id);
          break;
        }
      }
      
      // レコードが見つかった場合
      if (foundRow !== -1) {
        Logger.log('更新対象レコード: 行=' + (foundRow + 1));
        
        // ★★★ 修正: 更新用データ行を生成（より安全な方法） ★★★
        var rowData = new Array(reportSheet.getLastColumn()).fill('');
        
        // 既存の値をコピー
        for (var j = 0; j < reportData[foundRow].length; j++) {
          rowData[j] = reportData[foundRow][j];
        }
        
        // 必要なフィールドだけを更新
        rowData[yIndex] = data.y;
        rowData[wIndex] = data.w;
        rowData[tIndex] = data.t;
        rowData[nextIndex] = data.next || '';
        rowData[commentIndex] = data.comment || '';
        rowData[statusIndex] = data.status;
        rowData[updatedAtIndex] = now;
        
        // 登録日が含まれていれば設定（更新時も報告日を変更可能に）
        if (reportDateIndex !== -1 && data.reportDate) {
          try {
            var reportDate = new Date(data.reportDate);
            rowData[reportDateIndex] = reportDate;
            Logger.log('登録日を更新: ' + reportDate);
          } catch (e) {
            Logger.log('登録日解析エラー: ' + e.toString());
          }
        }
        
        // 1行だけを更新
        reportSheet.getRange(foundRow + 1, 1, 1, rowData.length).setValues([rowData]);
        Logger.log('更新完了: ID=' + data.id + ', 行=' + (foundRow + 1));
        
        // キャッシュを削除
        var cache = CacheService.getScriptCache();
        cache.remove('report_' + data.id);
        
        // 公開ステータスで通知が必要か確認
        if (data.status === '公開' && reportData[foundRow][statusIndex] !== '公開') {
          try {
            sendNotifications(data.id);
            Logger.log('通知送信完了');
          } catch (e) {
            Logger.log('通知送信エラー: ' + e.toString());
          }
        }
        
        return {success: true, id: data.id, updated: true};
      } else {
        // IDが指定されているが一致するレコードが見つからない場合
        Logger.log('エラー: 指定されたID「' + data.id + '」の日報が見つかりません');
        Logger.log('全レコード数: ' + (reportData.length - 1)); // ヘッダー行を除く
        return {success: false, message: '指定されたIDの日報が見つかりません。'};
      }
    } 
    // === 新規作成の場合 ===
    else {
      Logger.log('新規日報の作成処理開始');
      var id = Utilities.getUuid();
      var user = Session.getActiveUser().getEmail();
      
      // 新しい行のデータを作成
      var newRowData = new Array(reportSheet.getLastColumn()).fill('');
      
      newRowData[idIndex] = id;
      newRowData[createdAtIndex] = now;
      newRowData[authorIndex] = user;
      newRowData[yIndex] = data.y;
      newRowData[wIndex] = data.w;
      newRowData[tIndex] = data.t;
      newRowData[nextIndex] = data.next || '';
      newRowData[commentIndex] = data.comment || '';
      newRowData[statusIndex] = data.status;
      newRowData[updatedAtIndex] = now;
      
      // 登録日が含まれていれば設定
      if (reportDateIndex !== -1) {
        try {
          var reportDate = data.reportDate ? new Date(data.reportDate) : now;
          newRowData[reportDateIndex] = reportDate;
          Logger.log('登録日を設定: ' + reportDate);
        } catch (e) {
          newRowData[reportDateIndex] = now;
          Logger.log('登録日解析エラー: ' + e.toString());
        }
      }
      
      // 新規行を追加
      reportSheet.appendRow(newRowData);
      Logger.log('新規作成完了: ID=' + id);
      
      // 公開ステータスなら通知を送信
      if (data.status === '公開') {
        try {
          sendNotifications(id);
          Logger.log('通知送信完了');
        } catch (e) {
          Logger.log('通知送信エラー: ' + e.toString());
        }
      }
      
      return {success: true, id: id, created: true};
    }
  } catch (e) {
    Logger.log('日報保存エラー: ' + e.toString() + '\nスタックトレース: ' + e.stack);
    return {success: false, message: 'エラーが発生しました: ' + e.message};
  } finally {
    Logger.log('=========== saveReport 終了 ===========');
  }
}

// IDで日報を取得（登録日対応版）
function getReportById(id) {
  // キャッシュから取得を試みる（パフォーマンス改善）
  var cache = CacheService.getScriptCache();
  var cachedReport = cache.get('report_' + id);
  
  if (cachedReport) {
    return JSON.parse(cachedReport);
  }
  
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var reportSheet = ss.getSheetByName(SHEET_NAMES.DAILY_REPORT);
  var reportData = reportSheet.getDataRange().getValues();
  var headers = reportData[0];
  
  // ヘッダー行のインデックスを取得
  var idIndex = headers.indexOf('ID');
  var createdAtIndex = headers.indexOf('作成日時');
  var authorIndex = headers.indexOf('作成者');
  var yIndex = headers.indexOf('やったこと(Y)');
  var wIndex = headers.indexOf('わかったこと(W)');
  var tIndex = headers.indexOf('つぎやること(T)');
  var nextIndex = headers.indexOf('明日やること');
  var commentIndex = headers.indexOf('感想等');
  var statusIndex = headers.indexOf('ステータス');
  var updatedAtIndex = headers.indexOf('最終更新日時');
  var reportDateIndex = headers.indexOf('登録日');
  
  // ヘッダーをスキップして検索
  for (var i = 1; i < reportData.length; i++) {
    if (reportData[i][idIndex] === id) {
      // 使いやすい形式に変換 - インデックスを使用して明示的にマッピング
      var report = {
        id: reportData[i][idIndex],
        createdAt: reportData[i][createdAtIndex],
        author: reportData[i][authorIndex],
        reportDate: reportDateIndex !== -1 ? reportData[i][reportDateIndex] : reportData[i][createdAtIndex], // 登録日があればそれを使用
        y: reportData[i][yIndex],
        w: reportData[i][wIndex],
        t: reportData[i][tIndex],
        next: reportData[i][nextIndex],
        comment: reportData[i][commentIndex],
        status: reportData[i][statusIndex],
        updatedAt: reportData[i][updatedAtIndex]
      };
      
      // 結果をキャッシュに保存（パフォーマンス改善）
      cache.put('report_' + id, JSON.stringify(report), CACHE_EXPIRATION);
      
      return report;
    }
  }
  return null;
}

// 日報一覧を取得（検索条件あり）- 登録日対応版
function getReports(params) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var reportSheet = ss.getSheetByName(SHEET_NAMES.DAILY_REPORT);
  
  // データ範囲を最小限に制限（パフォーマンス改善）
  var lastRow = Math.min(reportSheet.getLastRow(), 500); // 最大500行まで
  var reportData = reportSheet.getRange(1, 1, lastRow, reportSheet.getLastColumn()).getValues();
  
  var headers = reportData[0];
  var results = [];
  
  // ヘッダー行のインデックスを取得
  var idIndex = headers.indexOf('ID');
  var createdAtIndex = headers.indexOf('作成日時');
  var authorIndex = headers.indexOf('作成者');
  var yIndex = headers.indexOf('やったこと(Y)');
  var wIndex = headers.indexOf('わかったこと(W)');
  var tIndex = headers.indexOf('つぎやること(T)');
  var nextIndex = headers.indexOf('明日やること');
  var commentIndex = headers.indexOf('感想等');
  var statusIndex = headers.indexOf('ステータス');
  var updatedAtIndex = headers.indexOf('最終更新日時');
  var reportDateIndex = headers.indexOf('登録日');
  
  // 検索条件を解析
  var searchTerm = params.search ? params.search.toLowerCase() : '';
  var authorFilter = params.author || '';
  var startDate = params.startDate ? new Date(params.startDate) : null;
  var endDate = params.endDate ? new Date(params.endDate) : null;
  
  // 日報データをフィルタリング
  for (var i = 1; i < reportData.length; i++) {
    // 公開済みのみ表示（ただし作成者自身には下書きも表示）
    var isPublic = reportData[i][statusIndex] === '公開';
    var isAuthor = reportData[i][authorIndex] === Session.getActiveUser().getEmail();
    
    if (!isPublic && !isAuthor) {
      continue;
    }
    
    // 作成者フィルター
    if (authorFilter && reportData[i][authorIndex] !== authorFilter) {
      continue;
    }
    
    // 日付範囲フィルター - 登録日があればそれを使用
    var reportDate = reportDateIndex !== -1 && reportData[i][reportDateIndex] ? 
                    new Date(reportData[i][reportDateIndex]) : 
                    new Date(reportData[i][createdAtIndex]);
    
    if (startDate && reportDate < startDate) {
      continue;
    }
    if (endDate && reportDate > endDate) {
      continue;
    }
    
    // テキスト検索（全フィールド対象）
    if (searchTerm) {
      var matched = false;
      for (var j = 0; j < reportData[i].length; j++) {
        var cellValue = String(reportData[i][j]).toLowerCase();
        if (cellValue.indexOf(searchTerm) !== -1) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        continue;
      }
    }
    
    // 結果に追加 - インデックスを使用して明示的にマッピング
    var report = {
      id: reportData[i][idIndex],
      createdAt: reportData[i][createdAtIndex],
      author: reportData[i][authorIndex],
      reportDate: reportDateIndex !== -1 ? reportData[i][reportDateIndex] : reportData[i][createdAtIndex], // 登録日があればそれを使用
      y: reportData[i][yIndex],
      w: reportData[i][wIndex],
      t: reportData[i][tIndex],
      next: reportData[i][nextIndex],
      comment: reportData[i][commentIndex],
      status: reportData[i][statusIndex],
      updatedAt: reportData[i][updatedAtIndex]
    };
    
    results.push(report);
  }
  
  // 登録日の降順でソート
  results.sort(function(a, b) {
    return new Date(b.reportDate) - new Date(a.reportDate);
  });
  
  return results;
}

// 通知メールを送信
function sendNotifications(reportId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  var settingSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  var userData = userSheet.getDataRange().getValues();
  var settingData = settingSheet.getDataRange().getValues();
  
  // 設定を取得
  var subject = '';
  var bodyTemplate = '';
  
  for (var i = 1; i < settingData.length; i++) {
    if (settingData[i][0] === '通知メール件名') {
      subject = settingData[i][1];
    } else if (settingData[i][0] === '通知メール本文') {
      bodyTemplate = settingData[i][1];
    }
  }
  
  // URLを生成
  var url = ScriptApp.getService().getUrl() + '?action=detail&id=' + reportId;
  var body = bodyTemplate.replace('{URL}', url);
  
  // 通知希望ユーザーにメールを送信
  for (var i = 1; i < userData.length; i++) {
    if (userData[i][2] === 'TRUE') { // 通知設定がオン
      var email = userData[i][0];
      try {
        MailApp.sendEmail(email, subject, body);
      } catch (e) {
        Logger.log('通知メール送信エラー: ' + email + ', ' + e.toString());
      }
    }
  }
}

// 改善版 saveComment 関数
function saveComment(data) {
  try {
    // 重要: コメント保存処理のデバッグログを詳細に出力
    Logger.log('コメント保存開始: reportId=' + (data.reportId || '不明') + 
              ', parentId=' + (data.parentId || 'なし') +
              ', contentLength=' + (data.content ? data.content.length : 0));
    
    // コメントシートの構造を確認・修正
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    setupCommentSheet(ss, [SHEET_NAMES.COMMENTS]);
    
    // 入力データの検証
    if (!data || !data.reportId) {
      Logger.log('コメントデータ不正: 日報IDが指定されていません');
      return {success: false, message: '日報IDが指定されていません'};
    }
    
    if (!data.content || data.content.trim() === '') {
      Logger.log('コメントデータ不正: コメント内容が空です');
      return {success: false, message: 'コメント内容を入力してください'};
    }
    
    var commentSheet = ss.getSheetByName(SHEET_NAMES.COMMENTS);
    var headerRow = commentSheet.getRange(1, 1, 1, commentSheet.getLastColumn()).getValues()[0];
    
    // 必要なカラム位置を取得
    var idCol = headerRow.indexOf('ID') + 1;
    var reportIdCol = headerRow.indexOf('日報ID') + 1;
    var parentIdCol = headerRow.indexOf('親コメントID') + 1;
    var authorCol = headerRow.indexOf('作成者') + 1;
    var contentCol = headerRow.indexOf('コメント内容') + 1;
    var createdAtCol = headerRow.indexOf('作成日時') + 1;
    
    // すべてのカラムが存在することを確認
    if (idCol === 0 || reportIdCol === 0 || parentIdCol === 0 || 
        authorCol === 0 || contentCol === 0 || createdAtCol === 0) {
      Logger.log('コメントシート構造エラー: 必要なカラムが見つかりません');
      return {success: false, message: 'コメントシートの構成が不正です'};
    }
    
    var now = new Date();
    var user = Session.getActiveUser().getEmail();
    var id = Utilities.getUuid();
    var parentId = data.parentId || '';
    
    // コンテンツのエスケープ処理
    var escapedContent = escapeHtml(data.content);
    
    try {
      // 一行ずつ新しい値を設定（セーフティ対策）
      var lastRow = commentSheet.getLastRow() + 1;
      commentSheet.getRange(lastRow, idCol).setValue(id);
      commentSheet.getRange(lastRow, reportIdCol).setValue(data.reportId);
      commentSheet.getRange(lastRow, parentIdCol).setValue(parentId);
      commentSheet.getRange(lastRow, authorCol).setValue(user);
      commentSheet.getRange(lastRow, contentCol).setValue(escapedContent);
      commentSheet.getRange(lastRow, createdAtCol).setValue(now);
      
      // キャッシュを明示的に削除
      var cache = CacheService.getScriptCache();
      cache.remove('comments_' + data.reportId);
      
      // 保存成功のログを出力
      Logger.log('コメント保存成功: ID=' + id + 
                ', 日報ID=' + data.reportId + 
                ', 親ID=' + parentId + 
                ', 作成者=' + user + 
                ', 内容=' + escapedContent.substring(0, 20) + 
                '..., 作成日時=' + now);
      
      // 保存されたコメントを返す
      return {
        success: true, 
        comment: {
          id: id,
          reportId: data.reportId,
          parentId: parentId || '',
          author: user,
          content: data.content,
          createdAt: now
        }
      };
    } catch (insertError) {
      Logger.log('コメント行挿入エラー: ' + insertError.toString());
      return {
        success: false, 
        message: 'コメントの保存に失敗しました: ' + insertError.message
      };
    }
  } catch (e) {
    Logger.log('コメント保存エラー: ' + e.toString() + '\nスタックトレース: ' + e.stack);
    return {
      success: false, 
      message: 'エラーが発生しました: ' + e.message
    };
  }
}

// 日報IDに基づいてコメントを取得
function getCommentsByReportId(reportId) {
  try {
    // コメントシートの構造を確認・修正
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    setupCommentSheet(ss, [SHEET_NAMES.COMMENTS]);
    
    // キャッシュから取得を試みる
    var cache = CacheService.getScriptCache();
    var cachedComments = cache.get('comments_' + reportId);
    
    if (cachedComments) {
      return JSON.parse(cachedComments);
    }
    
    var commentSheet = ss.getSheetByName(SHEET_NAMES.COMMENTS);
    var headerRow = commentSheet.getRange(1, 1, 1, commentSheet.getLastColumn()).getValues()[0];
    
    // 必要なカラム位置を取得
    var idCol = headerRow.indexOf('ID') + 1;
    var reportIdCol = headerRow.indexOf('日報ID') + 1;
    var parentIdCol = headerRow.indexOf('親コメントID') + 1;
    var authorCol = headerRow.indexOf('作成者') + 1;
    var contentCol = headerRow.indexOf('コメント内容') + 1;
    var createdAtCol = headerRow.indexOf('作成日時') + 1;
    
    // すべてのカラムが存在することを確認
    if (idCol === 0 || reportIdCol === 0 || parentIdCol === 0 || 
        authorCol === 0 || contentCol === 0 || createdAtCol === 0) {
      Logger.log('コメントシート構造エラー: 必要なカラムが見つかりません');
      return [];
    }
    
    var results = [];
    var lastRow = commentSheet.getLastRow();
    
    if (lastRow > 1) {
      var commentsData = commentSheet.getRange(2, 1, lastRow - 1, commentSheet.getLastColumn()).getValues();
      
      for (var i = 0; i < commentsData.length; i++) {
        var rowData = commentsData[i];
        
        // 各カラムのデータを取得（列のインデックスは0始まり）
        var id = rowData[idCol - 1];
        var currentReportId = rowData[reportIdCol - 1];
        var parentId = rowData[parentIdCol - 1] || '';
        var author = rowData[authorCol - 1];
        var content = rowData[contentCol - 1];
        var createdAt = rowData[createdAtCol - 1];
        
        // 指定された日報IDのコメントのみを取得
        if (currentReportId === reportId) {
          results.push({
            id: id,
            reportId: currentReportId,
            parentId: parentId,
            author: author,
            content: content,
            createdAt: createdAt
          });
        }
      }
    }
    
    // 結果をキャッシュに保存
    if (results.length > 0) {
      cache.put('comments_' + reportId, JSON.stringify(results), CACHE_EXPIRATION);
    }
    
    Logger.log('コメント取得成功: 日報ID=' + reportId + ', 件数=' + results.length);
    return results;
    
  } catch (e) {
    Logger.log('コメント取得エラー: ' + e.toString());
    return [];
  }
}

// 重複レコード検出と削除のための管理機能
function cleanupDuplicateReports() {
  // 管理者権限チェック
  var user = Session.getActiveUser().getEmail();
  if (!isAdmin(user)) {
    return {success: false, message: '管理者権限が必要です'};
  }
  
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var reportSheet = ss.getSheetByName(SHEET_NAMES.DAILY_REPORT);
  var reportData = reportSheet.getDataRange().getValues();
  var headers = reportData[0];
  
  // IDのインデックスを取得
  var idIndex = headers.indexOf('ID');
  var updatedAtIndex = headers.indexOf('最終更新日時');
  
  if (idIndex === -1) {
    return {success: false, message: 'IDフィールドが見つかりません'};
  }
  
  // 重複チェック用マップ
  var idMap = {};
  var duplicateRows = [];
  var duplicateInfo = [];
  
  // 重複を検出（新しい順に）
  for (var i = reportData.length - 1; i > 0; i--) {
    var id = reportData[i][idIndex];
    
    if (!id) continue; // IDがない行はスキップ
    
    if (idMap[id]) {
      // 2つのレコードの更新日時を比較
      var existingDate = idMap[id].updatedAt ? new Date(idMap[id].updatedAt) : new Date(0);
      var currentDate = reportData[i][updatedAtIndex] ? new Date(reportData[i][updatedAtIndex]) : new Date(0);
      
      // より新しいほうを保持
      if (currentDate > existingDate) {
        // 現在の行が新しければ、既存のものを削除対象に
        duplicateRows.push(idMap[id].row);
        duplicateInfo.push({
          id: id,
          rowToDelete: idMap[id].row,
          rowToKeep: i + 1
        });
        
        // マップを更新
        idMap[id] = {
          row: i + 1,
          updatedAt: reportData[i][updatedAtIndex]
        };
      } else {
        // 既存の行が新しければ、現在の行を削除対象に
        duplicateRows.push(i + 1);
        duplicateInfo.push({
          id: id,
          rowToDelete: i + 1,
          rowToKeep: idMap[id].row
        });
      }
    } else {
      // 初めて見るIDを記録
      idMap[id] = {
        row: i + 1,
        updatedAt: reportData[i][updatedAtIndex]
      };
    }
  }
  
  // 重複行を削除（後ろから削除していくと行番号のずれを気にしなくて良い）
  duplicateRows.sort(function(a, b) { return b - a; });
  
  // 重複情報を詳細ログに記録
  Logger.log('重複レコード情報:');
  for (var i = 0; i < duplicateInfo.length; i++) {
    Logger.log('ID: ' + duplicateInfo[i].id + 
              ', 削除行: ' + duplicateInfo[i].rowToDelete + 
              ', 保持行: ' + duplicateInfo[i].rowToKeep);
  }
  
  // 実際に削除
  for (var i = 0; i < duplicateRows.length; i++) {
    reportSheet.deleteRow(duplicateRows[i]);
  }
  
  // スプレッドシートのキャッシュをクリア
  var cache = CacheService.getScriptCache();
  cache.remove('reports_list');
  
  return {
    success: true,
    message: duplicateRows.length + "件の重複日報を削除しました。",
    deletedCount: duplicateRows.length,
    details: duplicateInfo
  };
}

/**
 * メンテナンス処理（全キャッシュクリア）
 */
function clearAllCaches() {
  // 管理者権限チェック
  var user = Session.getActiveUser().getEmail();
  if (!isAdmin(user)) {
    return {success: false, message: '管理者権限が必要です'};
  }
  
  var cache = CacheService.getScriptCache();
  
  // 日報キャッシュをクリア
  cache.remove('reports_list');
  
  // 日報詳細のキャッシュをクリア
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var reportSheet = ss.getSheetByName(SHEET_NAMES.DAILY_REPORT);
  var reportData = reportSheet.getDataRange().getValues();
  var headers = reportData[0];
  var idIndex = headers.indexOf('ID');
  
  var clearedIds = [];
  
  if (idIndex !== -1) {
    for (var i = 1; i < reportData.length; i++) {
      var id = reportData[i][idIndex];
      if (id) {
        cache.remove('report_' + id);
        cache.remove('comments_' + id);
        clearedIds.push(id);
      }
    }
  }
  
  return {
    success: true,
    message: "すべてのキャッシュをクリアしました。",
    clearedIds: clearedIds.length
  };
}
