const video = document.querySelector('#video');
const start = document.querySelector('#start');
const switchCamera = document.querySelector('#switch');
const zoom = document.querySelector('#zoom');
const zoomValue = document.querySelector('#zoomValue');
const controls = document.querySelector('#controls');
const panel = document.querySelector('#startPanel');
const message = document.querySelector('#message');
const install = document.querySelector('#install');
let stream; let facingMode = 'user'; let deferredInstall;

function setZoom(value) { const z = Number(value); video.style.transform = `scale(${z})`; zoom.value = z; zoomValue.value = `${z.toFixed(1)}×`; zoomValue.textContent = `${z.toFixed(1)}×`; }
async function openCamera() {
  message.textContent = '';
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Ваш браузер не поддерживает доступ к камере.');
  stream?.getTracks().forEach(track => track.stop());
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  video.srcObject = stream; await video.play(); panel.hidden = true; controls.hidden = false; setZoom(1);
}
start.addEventListener('click', async () => { try { await openCamera(); } catch (error) { message.textContent = error.message || 'Не удалось открыть камеру. Проверьте разрешение в браузере.'; } });
switchCamera.addEventListener('click', async () => { facingMode = facingMode === 'user' ? 'environment' : 'user'; try { await openCamera(); } catch (error) { message.textContent = 'Не удалось переключить камеру.'; } });
zoom.addEventListener('input', event => setZoom(event.target.value));
document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => setZoom(button.dataset.zoom)));
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; install.hidden = false; });
install.addEventListener('click', async () => { deferredInstall?.prompt(); await deferredInstall?.userChoice; deferredInstall = null; install.hidden = true; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
