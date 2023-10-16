import { getBase64Async, saveBase64AsFile } from "../../utils.js";
import { getContext, getApiUrl, doExtrasFetch, extension_settings, modules } from "../../extensions.js";
import { callPopup, getRequestHeaders, saveSettingsDebounced } from "../../../script.js";
import { getMessageTimeStamp } from "../../RossAscends-mods.js";
export { MODULE_NAME };

const MODULE_NAME = 'caption';
const UPDATE_INTERVAL = 1000;

async function moduleWorker() {
    const hasConnection = getContext().onlineStatus !== 'no_connection';
    $('#send_picture').toggle(hasConnection);
}

async function setImageIcon() {
    try {
        const sendButton = $('#send_picture .extensionsMenuExtensionButton');
        sendButton.addClass('fa-image');
        sendButton.removeClass('fa-hourglass-half');
    }
    catch (error) {
        console.log(error);
    }
}

async function setSpinnerIcon() {
    try {
        const sendButton = $('#send_picture .extensionsMenuExtensionButton');
        sendButton.removeClass('fa-image');
        sendButton.addClass('fa-hourglass-half');
    }
    catch (error) {
        console.log(error);
    }
}

async function sendCaptionedMessage(caption, image) {
    const context = getContext();
    let messageText = `[${context.name1} sends ${context.name2 ?? ''} a picture that contains: ${caption}]`;

    if (extension_settings.caption.refine_mode) {
        messageText = await callPopup(
            '<h3>Review and edit the generated message:</h3>Press "Cancel" to abort the caption sending.',
            'input',
            messageText,
            { rows: 5, okButton: 'Send' });

        if (!messageText) {
            throw new Error('User aborted the caption sending.');
        }
    }

    const message = {
        name: context.name1,
        is_user: true,
        send_date: getMessageTimeStamp(),
        mes: messageText,
        extra: {
            image: image,
            title: messageText,
        },
    };
    context.chat.push(message);
    context.addOneMessage(message);
    await context.generate('caption');
}

async function doCaptionRequest(base64Img) {
    if (extension_settings.caption.local) {
        const apiResult = await fetch('/api/extra/caption', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ image: base64Img })
        });

        if (!apiResult.ok) {
            throw new Error('Failed to caption image via local pipeline.');
        }

        const data = await apiResult.json();
        return data;
    } else if (modules.includes('caption')) {
        const url = new URL(getApiUrl());
        url.pathname = '/api/caption';

        const apiResult = await doExtrasFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Bypass-Tunnel-Reminder': 'bypass',
            },
            body: JSON.stringify({ image: base64Img })
        });

        if (!apiResult.ok) {
            throw new Error('Failed to caption image via Extras.');
        }

        const data = await apiResult.json();
        return data;
    } else {
        throw new Error('No captioning module is available.');
    }
}

async function onSelectImage(e) {
    setSpinnerIcon();
    const file = e.target.files[0];

    if (!file || !(file instanceof File)) {
        return;
    }

    try {
        const context = getContext();
        const fileData = await getBase64Async(file);
        const base64Format = fileData.split(',')[0].split(';')[0].split('/')[1];
        const base64Data = fileData.split(',')[1];
        const data = await doCaptionRequest(base64Data);
        const caption = data.caption;
        const imageToSave = data.thumbnail ? data.thumbnail : base64Data;
        const format = data.thumbnail ? 'jpeg' : base64Format;
        const imagePath = await saveBase64AsFile(imageToSave, context.name2, '', format);
        await sendCaptionedMessage(caption, imagePath);
    }
    catch (error) {
        toastr.error('Failed to caption image.');
        console.log(error);
    }
    finally {
        e.target.form.reset();
        setImageIcon();
    }
}

function onRefineModeInput() {
    extension_settings.caption.refine_mode = $('#caption_refine_mode').prop('checked');
    saveSettingsDebounced();
}

jQuery(function () {
    function addSendPictureButton() {
        const sendButton = $(`
        <div id="send_picture" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-image extensionsMenuExtensionButton"></div>
            Send a Picture
        </div>`);

        $('#extensionsMenu').prepend(sendButton);
        $(sendButton).hide();
        $(sendButton).on('click', () => {
            const hasCaptionModule = modules.includes('caption') || extension_settings.caption.local;

            if (!hasCaptionModule) {
                toastr.error('No captioning module is available. Either enable the local captioning pipeline or connect to Extras.');
                return;
            }

            $('#img_file').trigger('click');
        });
    }
    function addPictureSendForm() {
        const inputHtml = `<input id="img_file" type="file" accept="image/*">`;
        const imgForm = document.createElement('form');
        imgForm.id = 'img_form';
        $(imgForm).append(inputHtml);
        $(imgForm).hide();
        $('#form_sheld').append(imgForm);
        $('#img_file').on('change', onSelectImage);
    }
    function addSettings() {
        const html = `
        <div class="caption_settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Image Captioning</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label class="checkbox_label" for="caption_local">
                        <input id="caption_local" type="checkbox" class="checkbox">
                        Use local captioning pipeline
                    </label>
                    <label class="checkbox_label" for="caption_refine_mode">
                        <input id="caption_refine_mode" type="checkbox" class="checkbox">
                        Edit captions before generation
                    </label>
                </div>
            </div>
        </div>
        `;
        $('#extensions_settings2').append(html);
    }

    addSettings();
    addPictureSendForm();
    addSendPictureButton();
    setImageIcon();
    moduleWorker();
    $('#caption_refine_mode').prop('checked', !!(extension_settings.caption.refine_mode));
    $('#caption_local').prop('checked', !!(extension_settings.caption.local));
    $('#caption_refine_mode').on('input', onRefineModeInput);
    $('#caption_local').on('input', () => {
        extension_settings.caption.local = !!$('#caption_local').prop('checked');
        saveSettingsDebounced();
    });
    setInterval(moduleWorker, UPDATE_INTERVAL);
});
