/*jshint esversion: 6 */
  
class OpenFileDialog {
    constructor(inputElement) {
        this.inputElement = inputElement;
    }

    /**
     * @param {(file: File) => void} handler 
     */
    onOpenFile(handler) {
        this.inputElement.addEventListener("change", () => {
            handler(this.inputElement.files && this.inputElement.files[0] || null);
        });
    }
    
    showOpenFileDialog() {
        this.inputElement.click();
    }
}

class ElectronHostService {

    constructor() {
    }

    initialize(callback) {
        this.callback = callback;
        const openFileDialog = new OpenFileDialog(document.getElementById('open-file-dialog'));
        
        updateView('welcome');
        
        const onFile = file => {
            if (file) {
                updateView('spinner');
                this.openBuffer(file);
            }
        };
        openFileDialog.onOpenFile(onFile);
    
        var openFileButton = document.getElementById('open-file-button');
        if (openFileButton) {
            openFileButton.style.opacity = 1;
            openFileButton.addEventListener('click', (e) => {
                openFileButton.style.opacity = 0;
                openFileDialog.showOpenFileDialog();
            });
        }

        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        document.addEventListener('drop', (e) => {
            e.preventDefault();
        });
        document.body.addEventListener('drop', (e) => { 
            e.preventDefault();
            var files = e.dataTransfer.files;
            onFile(files && files[0] || null);
            return false;
        });
    }

    showError(message) {
        alert(message);
    }

    request(file, callback) {
        var request = new XMLHttpRequest();
        if (file.endsWith('.pb')) {
            request.responseType = 'arraybuffer';

        }
        request.onload = () => {
            if (request.status == 200) {
                if (request.responseType == 'arraybuffer') {
                    callback(null, new Uint8Array(request.response));
                }
                else {
                    callback(null, request.responseText);
                }
            }
            else {
                callback(request.status, null);
            }
        };
        request.onerror = () => {
            callback(request.status, null);
        };
        request.open('GET', '.' + file, true);
        request.send();
    }

    openURL(url) {
        window.open(url, '_target');
    }

    /**
     * @param {File} file 
     */
    openBuffer(file) {          
        var size = file.size;
        const fileReader = new FileReader();
        fileReader.onloadend = () => {
            if (fileReader.error) {
                this.callback(fileReader.error, null, null);
            }
            else {
                var buffer = new Uint8Array(fileReader.result);
                this.callback(null, buffer, file.name);
            }
        };
        fileReader.readAsArrayBuffer(file);
    }
}

var hostService = new ElectronHostService();
