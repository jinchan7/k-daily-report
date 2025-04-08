// Utility.gs - 共通ユーティリティ関数
/**
 * HTMLエスケープを行う関数
 * @param {string} text エスケープする文字列
 * @return {string} エスケープされた文字列
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

/**
 * デバッグログを出力する関数
 * @param {string} message ログメッセージ
 * @param {Object} [data] 追加データ（オプション）
 */
function debugLog(message, data) {
  if (!DEBUG_MODE) return;
  
  var logMessage = '[日報システム] ' + message;
  
  if (data !== undefined) {
    Logger.log(logMessage + ': %s', JSON.stringify(data));
  } else {
    Logger.log(logMessage);
  }
}

/**
 * HTMLファイルを含める関数（テンプレート内で使用）
 * @param {string} filename HTMLファイル名
 * @return {string} HTMLファイルの内容
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * キャッシュを管理するユーティリティクラス
 */
var CacheUtil = {
  /**
   * キャッシュに値を保存する
   * @param {string} key キャッシュキー
   * @param {Object} value 保存する値（オブジェクト）
   * @param {number} [expirationSeconds] キャッシュ有効期間（秒）
   */
  put: function(key, value, expirationSeconds) {
    var cache = CacheService.getScriptCache();
    var seconds = expirationSeconds || CONFIG.CACHE_EXPIRATION;
    cache.put(key, JSON.stringify(value), seconds);
    debugLog('キャッシュに保存', { key: key, expiration: seconds + '秒' });
  },
  
  /**
   * キャッシュから値を取得する
   * @param {string} key キャッシュキー
   * @return {Object|null} 取得した値またはnull
   */
  get: function(key) {
    var cache = CacheService.getScriptCache();
    var value = cache.get(key);
    
    if (value !== null) {
      debugLog('キャッシュからデータ取得', { key: key });
      return JSON.parse(value);
    }
    
    debugLog('キャッシュに該当データなし', { key: key });
    return null;
  },
  
  /**
   * キャッシュから値を削除する
   * @param {string} key キャッシュキー
   */
  remove: function(key) {
    var cache = CacheService.getScriptCache();
    cache.remove(key);
    debugLog('キャッシュから削除', { key: key });
  }
};

/**
 * システムの初期設定を行う関数
 */
function setupSystem() {
  // スプレッドシートを取得
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  
  // 既存のシートをすべて取得
  var sheets = ss.getSheets();
  var sheetNames = sheets.map(function(sheet) { return sheet.getName(); });
  
  // 日報シート
  if (sheetNames.indexOf(CONFIG.SHEET_NAMES.DAILY_REPORT) === -1) {
    var reportSheet = ss.insertSheet(CONFIG.SHEET_NAMES.DAILY_REPORT);
    var reportHeaders = ['ID', '作成日時', '作成者', 'やったこと(Y)', 'わかったこと(W)', 
                        'つぎやること(T)', '明日やること', '感想等', 'ステータス', '最終更新日時', '登録日'];
    reportSheet.getRange(1, 1, 1, reportHeaders.length).setValues([reportHeaders]);
    reportSheet.setFrozenRows(1);
    debugLog('日報シートを作成しました');
  }
  
  // コメントシート
  if (sheetNames.indexOf(CONFIG.SHEET_NAMES.COMMENTS) === -1) {
    var commentSheet = ss.insertSheet(CONFIG.SHEET_NAMES.COMMENTS);
    commentSheet.getRange(1, 1, 1, CONFIG.COMMENT_HEADERS.length).setValues([CONFIG.COMMENT_HEADERS]);
    commentSheet.setFrozenRows(1);
    debugLog('コメントシートを作成しました');
  } else {
    setupCommentSheet(ss);
  }
  
  // ユーザーシート
  if (sheetNames.indexOf(CONFIG.SHEET_NAMES.USERS) === -1) {
    var userSheet = ss.insertSheet(CONFIG.SHEET_NAMES.USERS);
    var userHeaders = ['メールアドレス', '名前', '通知設定', 'ロール'];
    userSheet.getRange(1, 1, 1, userHeaders.length).setValues([userHeaders]);
    userSheet.setFrozenRows(1);
    debugLog('ユーザーシートを作成しました');
  }
  
  // 設定シート
  if (sheetNames.indexOf(CONFIG.SHEET_NAMES.SETTINGS) === -1) {
    var settingSheet = ss.insertSheet(CONFIG.SHEET_NAMES.SETTINGS);
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
    debugLog('設定シートを作成しました');
  }
  
  // 日報シートの構造を確認・更新（登録日カラムの追加）
  updateReportSheetColumns();
  
  return "システムのセットアップが完了しました。[公開] > [ウェブ アプリケーションとして導入] から公開設定を行ってください。";
}

/**
 * コメントシートのセットアップや修正を行う関数
 * @param {SpreadsheetApp.Spreadsheet} ss スプレッドシート
 */
function setupCommentSheet(ss) {
  ss = ss || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var commentSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.COMMENTS);
  var headerRow = commentSheet.getRange(1, 1, 1, commentSheet.getLastColumn()).getValues()[0];
  
  // 必要なヘッダーが存在するか確認
  var missingHeaders = [];
  for (var i = 0; i < CONFIG.COMMENT_HEADERS.length; i++) {
    if (headerRow.indexOf(CONFIG.COMMENT_HEADERS[i]) === -1) {
      missingHeaders.push(CONFIG.COMMENT_HEADERS[i]);
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
    commentSheet.getRange(1, 1, 1, CONFIG.COMMENT_HEADERS.length).setValues([CONFIG.COMMENT_HEADERS]);
    commentSheet.setFrozenRows(1);
    
    // 既存データがあれば、新しい構造に合わせて復元
    if (existingData.length > 0) {
      var newData = [];
      for (var i = 0; i < existingData.length; i++) {
        var row = [];
        // 新しいヘッダー構造に合わせてデータを配置
        for (var j = 0; j < CONFIG.COMMENT_HEADERS.length; j++) {
          var oldIndex = headerRow.indexOf(CONFIG.COMMENT_HEADERS[j]);
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
        commentSheet.getRange(2, 1, newData.length, CONFIG.COMMENT_HEADERS.length).setValues(newData);
      }
    }
    
    debugLog('コメントシートのヘッダーを修正しました', { missingHeaders: missingHeaders });
  }
}

/**
 * 日報シートのカラム構造を更新する関数（登録日カラムの追加）
 */
function updateReportSheetColumns() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var reportSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DAILY_REPORT);
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
    
    debugLog('日報シートに登録日カラムを追加しました');
  }
}

// 共通スクリプトを含める関数（テンプレート内で使用）
function includeCommonScript() {
  return '<script>' + CommonJS + '</script>';
}

/**
 * HTML内で共通して使用するJavaScript
 */
var CommonJS = `
// 共通ユーティリティ関数
// デバッグログ出力関数
function debugLog(message, data) {
  if (console && console.log) {
    if (data) {
      console.log('[日報システム] ' + message, data);
    } else {
      console.log('[日報システム] ' + message);
    }
  }
}

// メッセージ表示関数
function showMessage(message, type, duration) {
  // 既存のメッセージを削除
  var existingMessages = document.querySelectorAll('.message-box');
  existingMessages.forEach(function(msg) {
    if (document.body.contains(msg)) {
      document.body.removeChild(msg);
    }
  });
  
  var messageBox = document.createElement('div');
  messageBox.className = 'message-box';
  messageBox.style.position = 'fixed';
  messageBox.style.top = '20px';
  messageBox.style.left = '50%';
  messageBox.style.transform = 'translateX(-50%)';
  messageBox.style.padding = '15px 20px';
  messageBox.style.borderRadius = '4px';
  messageBox.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  messageBox.style.zIndex = '9999';
  messageBox.style.minWidth = '250px';
  messageBox.style.textAlign = 'center';
  
  // タイプに応じたスタイル
  if (type === 'error') {
    messageBox.style.backgroundColor = '#dc3545';
    messageBox.style.color = 'white';
  } else if (type === 'success') {
    messageBox.style.backgroundColor = '#28a745';
    messageBox.style.color = 'white';
  } else if (type === 'warning') {
    messageBox.style.backgroundColor = '#ffc107';
    messageBox.style.color = '#212529';
  } else if (type === 'loading') {
    messageBox.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    messageBox.style.color = 'white';
    
    // ロード中はスピナーを追加
    var spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.display = 'inline-block';
    spinner.style.width = '20px';
    spinner.style.height = '20px';
    spinner.style.border = '3px solid rgba(255,255,255,0.3)';
    spinner.style.borderRadius = '50%';
    spinner.style.borderTopColor = 'white';
    spinner.style.marginLeft = '10px';
    spinner.style.animation = 'spin 1s linear infinite';
    
    // アニメーション用のスタイル
    var style = document.createElement('style');
    style.innerHTML = '@keyframes spin {0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); }}';
    document.head.appendChild(style);
    
    messageBox.textContent = message;
    messageBox.appendChild(spinner);
  } else {
    messageBox.style.backgroundColor = '#007bff';
    messageBox.style.color = 'white';
    messageBox.textContent = message;
  }
  
  if (type !== 'loading') {
    messageBox.textContent = message;
  }
  
  document.body.appendChild(messageBox);
  
  // 自動的に消える（loading以外）
  if (type !== 'loading') {
    setTimeout(function() {
      if (document.body.contains(messageBox)) {
        document.body.removeChild(messageBox);
      }
    }, duration || 3000);
  }
  
  return messageBox;
}

// HTMLエスケープ
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 日付をフォーマット
function formatDate(date, format) {
  if (!date) return '';
  
  date = new Date(date);
  if (isNaN(date.getTime())) return '';
  
  if (format === 'date') {
    return date.toLocaleDateString('ja-JP');
  } else if (format === 'datetime') {
    return date.toLocaleString('ja-JP');
  } else if (format === 'iso') {
    return date.toISOString().split('T')[0];
  }
  
  return date.toLocaleString('ja-JP');
}

// サーバー通信のラッパー関数
var ServerApi = {
  // 日報保存
  saveReport: function(data, successCallback, failureCallback) {
    var loadingMessage = showMessage('保存中...', 'loading');
    
    // 実行ステータス
    var isProcessing = true;
    
    // タイムアウト設定（10秒）
    var timeoutId = setTimeout(function() {
      if (isProcessing) {
        debugLog('保存処理タイムアウト');
        
        if (document.body.contains(loadingMessage)) {
          document.body.removeChild(loadingMessage);
        }
        
        // タイムアウト通知
        showMessage('処理に時間がかかっています。そのままお待ちください...', 'warning', 5000);
        
        // 15秒後にリダイレクト提案
        setTimeout(function() {
          if (isProcessing && confirm('応答がありません。ページを更新しますか？\\n（変更は保存されている可能性があります）')) {
            try {
              if (data.id) {
                // 編集の場合は詳細画面へ
                window.location.href = '?action=detail&id=' + data.id;
              } else {
                // 新規の場合は一覧へ
                window.location.href = '?';
              }
            } catch (e) {
              debugLog('リダイレクトエラー', e);
              showMessage('画面遷移に失敗しました。手動でページを更新してください。', 'error', 5000);
            }
          }
        }, 10000);
      }
    }, 10000);
    
    // サーバーへ送信
    google.script.run
      .withSuccessHandler(function(result) {
        // 処理状態を更新
        isProcessing = false;
        clearTimeout(timeoutId);
        
        // ローディング表示を削除
        if (document.body.contains(loadingMessage)) {
          document.body.removeChild(loadingMessage);
        }
        
        // 応答をログ出力
        debugLog('保存結果', result);
        
        if (successCallback) {
          successCallback(result);
        }
      })
      .withFailureHandler(function(error) {
        // 処理状態を更新
        isProcessing = false;
        clearTimeout(timeoutId);
        
        // ローディング表示を削除
        if (document.body.contains(loadingMessage)) {
          document.body.removeChild(loadingMessage);
        }
        
        // エラーをログ出力
        debugLog('保存エラー', error);
        
        if (failureCallback) {
          failureCallback(error);
        } else {
          // エラー表示
          showMessage('エラーが発生しました: ' + (error.message || '不明なエラー'), 'error', 5000);
        }
      })
      .saveReport(data);
  },
  
  // コメント保存
  saveComment: function(data, successCallback, failureCallback) {
    var loadingMessage = showMessage('送信中...', 'loading');
    
    // 実行ステータス
    var isProcessing = true;
    
    // タイムアウト設定（8秒）
    var timeoutId = setTimeout(function() {
      if (isProcessing) {
        debugLog('コメント送信タイムアウト');
        
        if (document.body.contains(loadingMessage)) {
          document.body.removeChild(loadingMessage);
        }
        
        // タイムアウト通知
        showMessage('処理に時間がかかっています。そのままお待ちください...', 'warning', 5000);
      }
    }, 8000);
    
    // サーバーへ送信
    google.script.run
      .withSuccessHandler(function(result) {
        // 処理状態を更新
        isProcessing = false;
        clearTimeout(timeoutId);
        
        // ローディング表示を削除
        if (document.body.contains(loadingMessage)) {
          document.body.removeChild(loadingMessage);
        }
        
        // 応答をログ出力
        debugLog('コメント送信結果', result);
        
        if (successCallback) {
          successCallback(result);
        }
      })
      .withFailureHandler(function(error) {
        // 処理状態を更新
        isProcessing = false;
        clearTimeout(timeoutId);
        
        // ローディング表示を削除
        if (document.body.contains(loadingMessage)) {
          document.body.removeChild(loadingMessage);
        }
        
        // エラーをログ出力
        debugLog('コメント送信エラー', error);
        
        if (failureCallback) {
          failureCallback(error);
        } else {
          // エラー表示
          showMessage('エラーが発生しました: ' + (error.message || '不明なエラー'), 'error', 5000);
        }
      })
      .saveComment(data);
  },
  
  // 管理機能：重複日報を削除
  cleanupDuplicates: function(successCallback, failureCallback) {
    var loadingMessage = showMessage('重複日報を検出・削除しています...', 'loading');
    
    google.script.run
      .withSuccessHandler(function(result) {
        // ローディング表示を削除
        if (document.body.contains(loadingMessage)) {
          document.body.removeChild(loadingMessage);
        }
        
        if (successCallback) {
          successCallback(result);
        }
      })
      .withFailureHandler(function(error) {
        // ローディング表示を削除
        if (document.body.contains(loadingMessage)) {
          document.body.removeChild(loadingMessage);
        }
        
        if (failureCallback) {
          failureCallback(error);
        } else {
          // エラー表示
          showMessage('エラーが発生しました: ' + (error.message || '不明なエラー'), 'error', 5000);
        }
      })
      .cleanupDuplicateReports();
  },
  
  // 管理機能：キャッシュをクリア
  clearCache: function(successCallback, failureCallback) {
    var loadingMessage = showMessage('キャッシュをクリアしています...', 'loading');
    
    google.script.run
      .withSuccessHandler(function(result) {
        // ローディング表示を削除
        if (document.body.contains(loadingMessage)) {
          document.body.removeChild(loadingMessage);
        }
        
        if (successCallback) {
          successCallback(result);
        }
      })
      .withFailureHandler(function(error) {
        // ローディング表示を削除
        if (document.body.contains(loadingMessage)) {
          document.body.removeChild(loadingMessage);
        }
        
        if (failureCallback) {
          failureCallback(error);
        } else {
          // エラー表示
          showMessage('エラーが発生しました: ' + (error.message || '不明なエラー'), 'error', 5000);
        }
      })
      .clearAllCaches();
  }
};

// ページ遷移前の確認機能
var PageTransition = {
  init: function() {
    // ページロード完了時のフラグ
    window.pageFullyLoaded = false;
    
    // DOMContentLoaded 時に実行
    document.addEventListener('DOMContentLoaded', function() {
      // 5秒後にフラグを設定
      setTimeout(function() {
        window.pageFullyLoaded = true;
      }, 3000);
    });
    
    // ページ遷移前の確認
    window.addEventListener('beforeunload', function(e) {
      // ページが完全にロードされていなければ、確認メッセージを表示しない
      if (!window.pageFullyLoaded) {
        return undefined;
      }
      
      // フォームに変更があれば確認メッセージを表示
      var textareas = document.querySelectorAll('textarea');
      var unsavedChanges = false;
      
      for (var i = 0; i < textareas.length; i++) {
        if (textareas[i].value.trim() !== '' && !textareas[i].readOnly) {
          unsavedChanges = true;
          break;
        }
      }
      
      if (unsavedChanges) {
        var message = '入力中の内容があります。このページを離れますか？';
        e.returnValue = message;
        return message;
      }
    });
  },
  
  // 特定のURLに遷移（パラメータを考慮）
  navigate: function(action, id) {
    var url = '?';
    
    if (action) {
      url += 'action=' + action;
      
      if (id) {
        url += '&id=' + id;
      }
    }
    
    try {
      window.location.href = url;
    } catch (e) {
      debugLog('画面遷移エラー', e);
      showMessage('画面遷移に失敗しました', 'error', 3000);
    }
  }
};
`;
