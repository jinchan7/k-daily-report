// Config.gs - 設定情報
/**
 * アプリケーション設定
 * 
 * 共通設定値を一元管理します
 */
var CONFIG = {
  SPREADSHEET_ID: SpreadsheetApp.getActiveSpreadsheet().getId(),
  SHEET_NAMES: {
    DAILY_REPORT: '日報',
    COMMENTS: 'コメント',
    USERS: 'ユーザー',
    SETTINGS: '設定'
  },
  CACHE_EXPIRATION: 60, // キャッシュ有効期間（秒）
  COMMENT_HEADERS: ['ID', '日報ID', '親コメントID', '作成者', 'コメント内容', '作成日時'],
  USER_ROLES: {
    ADMIN: '管理者',
    EDITOR: '作成者',
    GENERAL: '一般'
  }
};

/**
 * 開発モードフラグ
 * true: 開発モード（より詳細なログ出力など）
 * false: 本番モード
 */
var DEBUG_MODE = false;
