// токен Telegram бота от \@BotFather.
const botToken = "TG_TOKEN"
const gptKey = "GPT_TOKEN"
const folderId = 'GDRIVE_FOLDER_ID';
const webAppUrl = 'URL_WEB_APP';

const telegramUrl = 'https://api.telegram.org/bot' + botToken;

function setWebhook() {
    var response = UrlFetchApp.fetch(telegramUrl + '/setWebhook?url=' + webAppUrl);
    console.log(response.getContentText());
}

function doPost(e) {
    if (e?.postData.contents) {
        const contents = JSON.parse(e.postData.contents)
        const msg = contents.message;
        const chat_id = msg.from.id;

        if (msg.text === "/start") {
            sendMessage(chat_id, msg.from.first_name + " добро пожаловать в бот для распознавания текста!\nПросто отправь мне фото или PDF документ.")
        }

        if (msg.photo || (msg.document && msg.document.mime_type === 'application/pdf')) {
            let ocrTexts = []
            if (msg.photo) {
                ocrTexts = getTextFromPhotoBlobAndSavePhoto(getBlobByTelegramFileID(msg.photo[msg.photo.length - 1].file_id), folderId);
            } else {
                ocrTexts = getTextFromPhotoBlobAndSavePhoto(getBlobByTelegramFileID(msg.document.file_id), folderId);
            }
            // sendMessage(
            //   chat_id, ocrTexts.length.toString())
            // let question = " Достань из договора ключевые параметры: паспортные данные, суммы и даты";

            // const message = processUpdate(ocrText + question);
            for (var i = 0; i < ocrTexts.length; ++i) {
                sendMessage(
                    chat_id,
                    ocrTexts[i].replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
                );
            }
            sendMessage(
                chat_id,
                "<b>------Конец файла-----</b>");
        } else {
            sendMessage(chat_id, "Файл формата " + msg.document.mime_type + " Не поддерживается!\nПринимаем только фото и PDF!")
        }
    }
}

function setStartButton() {
    var telegramApiUrl = "https://api.telegram.org/bot" + botToken + "/";

    var response = UrlFetchApp.fetch(telegramApiUrl + "setMyCommands", {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
            commands: [
                { command: "start", description: "Начать" }
            ]
        })
    });

    Logger.log(response.getContentText());
}

function deleteWebhook() {
    var response = UrlFetchApp.fetch(telegramUrl + '/deleteWebhook?url=' + webAppUrl);
    console.log(response.getContentText());
}

function sendMessage(chatId, message) {
    UrlFetchApp.fetch(telegramUrl + '/sendMessage', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'html'
        })
    })
}

function sendMessageKeyboard(chatId, message, keyBoard) {
    UrlFetchApp.fetch(telegramUrl + '/sendMessage', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
            chat_id: chatId,
            text: message,
            reply_markup: {
                keyboard: keyBoard,
                resize_keyboard: true,
                one_time_keyboard: true
            }
        })
    })
}

function sendMessageInlineMenu(chatId, message, inlineKeyboard) {
    UrlFetchApp.fetch(telegramUrl + '/sendMessage', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
            chat_id: chatId,
            text: message,
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        })
    })
}

function sendMessageKeyboardRemove(chatId, message) {
    UrlFetchApp.fetch(telegramUrl + '/sendMessage', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
            chat_id: chatId,
            text: message,
            reply_markup: {
                remove_keyboard: true
            }
        })
    })
}

/**
 * Функция getBlobByTelegramFileID принимает идентификатор файла Telegram в качестве аргумента и возвращает Blob объект, представляющий содержимое файла.
 * @param {string} tgFileId - Идентификатор файла Telegram.
 * @returns {Blob} - Blob объект, представляющий содержимое файла.
 */
function getBlobByTelegramFileID(tgFileId) {
    let response = UrlFetchApp.fetch("https://api.telegram.org/bot" + botToken + "/getFile?file_id=" + tgFileId);
    let filePath = JSON.parse(response.getContentText()).result.file_path;
    let fileUrl = "https://api.telegram.org/file/bot" + botToken + "/" + filePath;
    let blob = UrlFetchApp.fetch(fileUrl).getBlob();

    // Возвращение Blob объекта, представляющего содержимое файла
    return blob;
};

/**
 * Функция getTextFromJPGBlob принимает Blob объект, представляющий содержимое файла и ID папки для сохранения файлов и возвращает текст файла из изображения.
 * @param {string} tgFileId - Идентификатор файла Telegram
 * @returns {string}
 */
function getTextFromPhotoBlobAndSavePhoto(blob, folderId) {

    let file = Drive.Files.insert({
        title: blob.getName(),
        mimeType: blob.getContentType(),
        parents: [{ id: folderId }],

    }, blob);

    let ocrFile = Drive.Files.insert({ title: blob.getName(), parents: [{ id: folderId }] }, blob, { ocr: true });

    let texts = getTextFromMultiPageFile(ocrFile.getId())

    DriveApp.getFileById(file.getId()).setTrashed(true);
    DriveApp.getFileById(ocrFile.getId()).setTrashed(true);

    return texts;
}

function getTextFromMultiPageFile(fileId) {
    let doc = DocumentApp.openById(fileId);
    let body = doc.getBody()
    var numPages = doc.getBody().getNumChildren()
    var texts = [];

    for (var i = 0; i < numPages; i++) {
        var pageElement = body.getChild(i);
        if (pageElement.getType().toString() === "UNSUPPORTED") continue;
        var text = pageElement.asText().getText();
        if (text) {
            texts.push(text);
        }
    }
    Logger.log(texts)
    return texts;
}

function processUpdate(prompt) {
    // let prompt = "Привет, как дела?"
    // const scriptProps = PropertiesService.getDocumentProperties();
    // const key = scriptProps.getProperty('chatGptApiKey');
    const url = 'https://api.openai.com/v1/chat/completions';
    const options = {
        method: 'post',
        headers: {
            Authorization: `Bearer ${gptKey}`,
            'Content-Type': 'application/json',
        },
        muteHttpExceptions: false,
        payload: JSON.stringify({
            prompt,
            model: 'gpt-3.5-turbo',
            temperature: 1,
            max_tokens: 100,
        }),
    };
    const response = UrlFetchApp.fetch(url, options);
    const content = response.getContentText();
    const jsn = JSON.parse(content);
    if (jsn.choices && jsn.choices[0]) {
        Logger.log(jsn.choices[0])
        return jsn.choices[0].text;
    } else {
        return 'Пожалуйста, попробуйте ещё раз!';
    }
}
