/**
 * Controle de Expediente + Tarefas
 * Backend simples em Google Apps Script usando uma planilha como database.
 *
 * Como usar:
 * 1) Crie uma planilha Google.
 * 2) Abra Extensões > Apps Script.
 * 3) Cole este arquivo como Code.gs / Codigo.gs.
 * 4) Rode a função setup() uma vez e autorize.
 * 5) Copie a chave gerada na aba CONFIG.
 * 6) Publique como Web App.
 */

var SHEETS = {
  WORK_DAYS: "DIAS",
  TASKS: "TAREFAS",
  SESSIONS: "SESSOES",
  CONFIG: "CONFIG"
};

var HEADERS = {
  WORK_DAYS: [
    "id",
    "date",
    "arrivalTime",
    "targetMinutes",
    "breakMinutes",
    "initialBalanceMinutes",
    "endTime",
    "workedMinutes",
    "dayBalanceMinutes",
    "notes",
    "createdAt",
    "updatedAt"
  ],
  TASKS: [
    "id",
    "date",
    "title",
    "description",
    "status",
    "category",
    "plannedStart",
    "plannedEnd",
    "actualStart",
    "actualEnd",
    "durationMinutes",
    "createdAt",
    "updatedAt"
  ],
  SESSIONS: [
    "id",
    "taskId",
    "startedAt",
    "endedAt",
    "durationMinutes",
    "note",
    "createdAt",
    "updatedAt"
  ]
};

function setup() {
  ensureSheets_();

  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty("API_SECRET");

  if (!secret) {
    secret = Utilities.getUuid() + "-" + Utilities.getUuid();
    props.setProperty("API_SECRET", secret);
  }

  writeConfig_(secret);

  return "Setup concluído. Copie a chave da aba CONFIG e cole nas configurações do site.";
}

function resetSecret() {
  var secret = Utilities.getUuid() + "-" + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty("API_SECRET", secret);
  writeConfig_(secret);
  return "Nova chave gerada. Copie a chave da aba CONFIG e atualize nas configurações do site.";
}

function doGet(e) {
  var callback = e && e.parameter ? e.parameter.callback : "";

  try {
    ensureSheets_();

    var params = e.parameter || {};
    validateSecret_(params.secret);

    var action = params.action || "getAll";
    var result;

    if (action === "ping") {
      result = {
        ok: true,
        message: "Conexão funcionando",
        serverTime: new Date().toISOString()
      };
    } else if (action === "getAll") {
      result = {
        ok: true,
        data: getAll_()
      };
    } else {
      throw new Error("Ação GET desconhecida: " + action);
    }

    return respond_(result, callback);
  } catch (err) {
    return respond_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    }, callback);
  }
}

function doPost(e) {
  try {
    ensureSheets_();

    var params = e.parameter || {};
    validateSecret_(params.secret);

    var action = params.action;
    var payload = {};

    if (params.payload) {
      payload = JSON.parse(params.payload);
    }

    var result;

    switch (action) {
      case "upsertWorkDay":
        result = upsertWorkDay_(payload);
        break;

      case "upsertTask":
        result = upsertTask_(payload);
        break;

      case "deleteTask":
        result = deleteTask_(payload.id);
        break;

      case "startTask":
        result = startTask_(payload);
        break;

      case "finishTask":
        result = finishTask_(payload);
        break;

      case "deleteWorkDay":
        result = deleteWorkDay_(payload.id);
        break;

      default:
        throw new Error("Ação POST desconhecida: " + action);
    }

    return respond_({
      ok: true,
      result: result
    });
  } catch (err) {
    return respond_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function getAll_() {
  return {
    days: getRows_(SHEETS.WORK_DAYS),
    tasks: getRows_(SHEETS.TASKS),
    sessions: getRows_(SHEETS.SESSIONS),
    serverTime: new Date().toISOString()
  };
}

function upsertWorkDay_(data) {
  if (!data || !data.date) {
    throw new Error("O campo date é obrigatório.");
  }

  var existing = findByField_(SHEETS.WORK_DAYS, HEADERS.WORK_DAYS, "date", data.date);

  if (existing && !data.id) {
    data.id = existing.id;
  }

  return upsertRecord_(SHEETS.WORK_DAYS, HEADERS.WORK_DAYS, data);
}

function upsertTask_(data) {
  if (!data || !data.title) {
    throw new Error("O campo title é obrigatório.");
  }

  if (!data.date) {
    throw new Error("O campo date é obrigatório.");
  }

  if (!data.status) {
    data.status = "pendente";
  }

  if (data.actualStart && data.actualEnd && !data.durationMinutes) {
    data.durationMinutes = diffMinutes_(data.actualStart, data.actualEnd);
  }

  return upsertRecord_(SHEETS.TASKS, HEADERS.TASKS, data);
}

function deleteTask_(id) {
  if (!id) {
    throw new Error("ID da tarefa não informado.");
  }

  deleteRowsByField_(SHEETS.SESSIONS, HEADERS.SESSIONS, "taskId", id);
  return deleteById_(SHEETS.TASKS, HEADERS.TASKS, id);
}

function deleteWorkDay_(id) {
  if (!id) {
    throw new Error("ID do dia não informado.");
  }

  var day = findById_(SHEETS.WORK_DAYS, HEADERS.WORK_DAYS, id);
  if (day && day.date) {
    var tasks = getRows_(SHEETS.TASKS).filter(function(task) {
      return String(task.date) === String(day.date);
    });

    tasks.forEach(function(task) {
      deleteTask_(task.id);
    });
  }

  return deleteById_(SHEETS.WORK_DAYS, HEADERS.WORK_DAYS, id);
}

function startTask_(data) {
  if (!data || !data.id) {
    throw new Error("ID da tarefa não informado.");
  }

  var task = findById_(SHEETS.TASKS, HEADERS.TASKS, data.id);
  if (!task) {
    throw new Error("Tarefa não encontrada.");
  }

  var startedAt = data.startedAt || toLocalIso_(new Date());

  var active = findActiveSession_(task.id);
  if (!active) {
    upsertRecord_(SHEETS.SESSIONS, HEADERS.SESSIONS, {
      taskId: task.id,
      startedAt: startedAt,
      endedAt: "",
      durationMinutes: "",
      note: ""
    });
  }

  task.status = "em_andamento";
  if (!task.actualStart) {
    task.actualStart = startedAt;
  }
  task.actualEnd = "";

  return upsertRecord_(SHEETS.TASKS, HEADERS.TASKS, task);
}

function finishTask_(data) {
  if (!data || !data.id) {
    throw new Error("ID da tarefa não informado.");
  }

  var task = findById_(SHEETS.TASKS, HEADERS.TASKS, data.id);
  if (!task) {
    throw new Error("Tarefa não encontrada.");
  }

  var endedAt = data.endedAt || toLocalIso_(new Date());
  var active = findActiveSession_(task.id);

  if (active) {
    active.endedAt = endedAt;
    active.durationMinutes = diffMinutes_(active.startedAt, active.endedAt);
    upsertRecord_(SHEETS.SESSIONS, HEADERS.SESSIONS, active);
  }

  task.status = "concluida";

  if (!task.actualStart && active && active.startedAt) {
    task.actualStart = active.startedAt;
  }

  if (!task.actualStart) {
    task.actualStart = endedAt;
  }

  task.actualEnd = endedAt;
  task.durationMinutes = sumTaskSessions_(task.id);

  if (!task.durationMinutes && task.actualStart && task.actualEnd) {
    task.durationMinutes = diffMinutes_(task.actualStart, task.actualEnd);
  }

  return upsertRecord_(SHEETS.TASKS, HEADERS.TASKS, task);
}

function ensureSheets_() {
  ensureSheet_(SHEETS.WORK_DAYS, HEADERS.WORK_DAYS);
  ensureSheet_(SHEETS.TASKS, HEADERS.TASKS);
  ensureSheet_(SHEETS.SESSIONS, HEADERS.SESSIONS);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var config = ss.getSheetByName(SHEETS.CONFIG);
  if (!config) {
    config = ss.insertSheet(SHEETS.CONFIG);
  }
}

function ensureSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#d9ead3");
}

function writeConfig_(secret) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.CONFIG) || ss.insertSheet(SHEETS.CONFIG);

  sheet.clear();
  sheet.getRange(1, 1, 6, 2).setValues([
    ["Item", "Valor"],
    ["API_SECRET", secret],
    ["Última configuração", new Date()],
    ["Uso", "Copie a API_SECRET e cole nas configurações do site."],
    ["Observação", "Não coloque essa chave no GitHub."],
    ["Web App URL", "Cole aqui depois de publicar, se quiser guardar."]
  ]);

  sheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#cfe2f3");
  sheet.autoResizeColumns(1, 2);
}

function validateSecret_(secret) {
  var stored = PropertiesService.getScriptProperties().getProperty("API_SECRET");

  if (!stored) {
    throw new Error("API_SECRET não configurada. Rode a função setup() primeiro.");
  }

  if (!secret || String(secret) !== String(stored)) {
    throw new Error("Chave inválida.");
  }
}

function getRows_(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

  if (!sheet) {
    return [];
  }

  var values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  var headers = values[0];

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(value) {
        return value !== "";
      });
    })
    .map(function(row) {
      return rowToObject_(headers, row);
    });
}

function rowToObject_(headers, row) {
  var obj = {};

  headers.forEach(function(header, index) {
    obj[header] = normalizeValue_(row[index]);
  });

  return obj;
}

function normalizeValue_(value) {
  if (value instanceof Date) {
    return toLocalIso_(value);
  }

  return value;
}

function findById_(sheetName, headers, id) {
  return findByField_(sheetName, headers, "id", id);
}

function findByField_(sheetName, headers, field, value) {
  var rows = getRows_(sheetName);

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][field]) === String(value)) {
      return rows[i];
    }
  }

  return null;
}

function upsertRecord_(sheetName, headers, data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var values = sheet.getDataRange().getValues();

  if (!data.id) {
    data.id = Utilities.getUuid();
  }

  var rowIndex = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.id)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > -1) {
    var existing = rowToObject_(headers, values[rowIndex - 1]);
    data = Object.assign(existing, data);
  }

  var now = toLocalIso_(new Date());

  if (!data.createdAt) {
    data.createdAt = now;
  }

  data.updatedAt = now;

  var row = headers.map(function(header) {
    return data[header] === undefined || data[header] === null ? "" : data[header];
  });

  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return data;
}

function deleteById_(sheetName, headers, id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var values = sheet.getDataRange().getValues();

  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return {
        deleted: true,
        id: id
      };
    }
  }

  return {
    deleted: false,
    id: id
  };
}

function deleteRowsByField_(sheetName, headers, field, value) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var values = sheet.getDataRange().getValues();
  var fieldIndex = headers.indexOf(field);

  if (fieldIndex < 0) {
    throw new Error("Campo não encontrado: " + field);
  }

  var deleted = 0;

  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][fieldIndex]) === String(value)) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }

  return deleted;
}

function findActiveSession_(taskId) {
  var sessions = getRows_(SHEETS.SESSIONS);

  for (var i = sessions.length - 1; i >= 0; i--) {
    if (String(sessions[i].taskId) === String(taskId) && !sessions[i].endedAt) {
      return sessions[i];
    }
  }

  return null;
}

function sumTaskSessions_(taskId) {
  var sessions = getRows_(SHEETS.SESSIONS);
  var total = 0;

  sessions.forEach(function(session) {
    if (String(session.taskId) === String(taskId)) {
      var minutes = Number(session.durationMinutes || 0);
      if (!isNaN(minutes)) {
        total += minutes;
      }
    }
  });

  return total;
}

function diffMinutes_(start, end) {
  var startDate = new Date(start);
  var endDate = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return "";
  }

  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
}

function toLocalIso_(date) {
  var tz = Session.getScriptTimeZone();
  return Utilities.formatDate(date, tz, "yyyy-MM-dd'T'HH:mm:ss");
}

function respond_(obj, callback) {
  var text = JSON.stringify(obj);

  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + "(" + text + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}
