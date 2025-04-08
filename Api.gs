// Api.gs - Webアプリのエントリーポイント
/**
 * Webアプリとしてアクセスされたときの処理
 * @param {Object} e リクエストパラメータ
 * @return {HtmlOutput} HTML出力
 */
function doGet(e) {
  var user = Session.getActiveUser().getEmail();
  var action = e.parameter.action || 'view';
  
  // ユーザー情報を取得・登録
  UserService.ensureUserExists(user);
  
  // 日報シートの構造を確認・更新（登録日カラムの追加）
  updateReportSheetColumns();
  
  // 管理者画面へのルーティング
  if (action === 'admin') {
    // 管理者権限チェック
    if (!UserService.isAdmin(user)) {
      // 権限がない場合は一覧画面にリダイレクト
      var template = HtmlService.createTemplateFromFile('view');
      template.reports = ReportService.getReports({
        search: e.parameter.search,
        author: e.parameter.author,
        startDate: e.parameter.startDate,
        endDate: e.parameter.endDate,
        currentUser: user
      });
      template.searchParam = e.parameter.search || '';
      template.authorParam = e.parameter.author || '';
      template.startDateParam = e.parameter.startDate || '';
      template.endDateParam = e.parameter.endDate || '';
      template.errorMessage = '管理者権限がありません。';
    } else {
      var template = HtmlService.createTemplateFromFile('admin');
      template.user = user;
      template.userName = UserService.getUserDisplayName(user);
      template.SPREADSHEET_ID = CONFIG.SPREADSHEET_ID;
      template.CACHE_EXPIRATION = CONFIG.CACHE_EXPIRATION;
      template.isAdmin = UserService.isAdmin(user);
      template.canCreate = UserService.canCreateReport(user);
      
      var htmlOutput = template.evaluate()
                              .setTitle('新任職員日報システム - 管理画面')
                              .addMetaTag('viewport', 'width=device-width, initial-scale=1')
                              .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      return htmlOutput;
    }
  }
  
  // システム初期化チェック（コメントシートなどの構造を確認）
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheetNames = ss.getSheets().map(function(sheet) { return sheet.getName(); });
  setupCommentSheet(ss);
  
  var template;
  
  // 新規作成時の権限チェック
  if (action === 'new' && !UserService.canCreateReport(user)) {
    // 権限がない場合は一覧画面にリダイレクト
    template = HtmlService.createTemplateFromFile('view');
    template.reports = ReportService.getReports({
      search: e.parameter.search,
      author: e.parameter.author,
      startDate: e.parameter.startDate,
      endDate: e.parameter.endDate,
      currentUser: user
    });
    template.searchParam = e.parameter.search || '';
    template.authorParam = e.parameter.author || '';
    template.startDateParam = e.parameter.startDate || '';
    template.endDateParam = e.parameter.endDate || '';
    template.errorMessage = '日報作成権限がありません。管理者にお問い合わせください。';
  } else if (action === 'new' || action === 'edit') {
    // 日報入力・編集画面
    template = HtmlService.createTemplateFromFile('form');
    if (action === 'edit' && e.parameter.id) {
      template.report = ReportService.getReportById(e.parameter.id);
    } else {
      template.report = null;
    }
  } else if (action === 'detail' && e.parameter.id) {
    // 日報詳細画面
    template = HtmlService.createTemplateFromFile('detail');
    template.report = ReportService.getReportById(e.parameter.id);
    template.comments = CommentService.getCommentsByReportId(e.parameter.id);
  } else {
    // 一覧表示画面（デフォルト）
    template = HtmlService.createTemplateFromFile('view');
    template.reports = ReportService.getReports({
      search: e.parameter.search,
      author: e.parameter.author,
      startDate: e.parameter.startDate,
      endDate: e.parameter.endDate,
      currentUser: user
    });
    template.searchParam = e.parameter.search || '';
    template.authorParam = e.parameter.author || '';
    template.startDateParam = e.parameter.startDate || '';
    template.endDateParam = e.parameter.endDate || '';
    template.errorMessage = '';
  }
  
  // 共通データ
  template.user = user;
  template.isAdmin = UserService.isAdmin(user);
  template.canCreate = UserService.canCreateReport(user);
  template.userName = UserService.getUserDisplayName(user);
  template.escapeHtml = escapeHtml;
  template.getUserDisplayName = UserService.getUserDisplayName;
  
  // テンプレートをスタンドアロンで評価
  var htmlOutput = template.evaluate()
                          .setTitle('新任職員日報システム')
                          .addMetaTag('viewport', 'width=device-width, initial-scale=1')
                          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return htmlOutput;
}

// 公開関数 - クライアントサイドからの呼び出し用
/**
 * 日報を保存
 * @param {Object} data 日報データ
 * @return {Object} 保存結果
 */
function saveReport(data) {
  return ReportService.saveReport(data);
}

/**
 * コメントを保存
 * @param {Object} data コメントデータ
 * @return {Object} 保存結果
 */
function saveComment(data) {
  return CommentService.saveComment(data);
}

/**
 * 重複日報をクリーンアップ
 * @return {Object} 処理結果
 */
function cleanupDuplicateReports() {
  return AdminService.cleanupDuplicateReports();
}

/**
 * すべてのキャッシュをクリア
 * @return {Object} 処理結果
 */
function clearAllCaches() {
  return AdminService.clearAllCaches();
}
