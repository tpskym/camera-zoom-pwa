const video = document.querySelector('#video');
const flash = document.querySelector('#flash');
const start = document.querySelector('#start');
const switchCamera = document.querySelector('#switch');
const zoom = document.querySelector('#zoom');
const zoomValue = document.querySelector('#zoomValue');
const controls = document.querySelector('#controls');
const panel = document.querySelector('#startPanel');
const message = document.querySelector('#message');
const install = document.querySelector('#install');
const capture = document.querySelector('#capture');
const lastPhoto = document.querySelector('#lastPhoto');
const lastPhotoImage = document.querySelector('#lastPhotoImage');
const viewer = document.querySelector('#viewer');
const photoStage = document.querySelector('.photo-stage');
const previewImage = document.querySelector('#previewImage');
const backToCamera = document.querySelector('#backToCamera');
const downloadPhoto = document.querySelector('#downloadPhoto');
const sharePhoto = document.querySelector('#sharePhoto');
const deletePhoto = document.querySelector('#deletePhoto');
let stream; let facingMode = 'user'; let deferredInstall; let currentPhoto; let photoUrl;
let messageTimer; let viewerScale = 1; let viewerX = 0; let viewerY = 0; let pinchStartDistance; let pinchStartScale; let dragStartX; let dragStartY; let dragStartOffsetX; let dragStartOffsetY;

const DB_NAME = 'faceup';
const STORE_NAME = 'photos';
function photoDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function savePhoto(blob) {
  const db = await photoDatabase(); const photo = { id: Date.now(), blob };
  await new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).put(photo); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close(); return photo;
}
async function loadLatestPhoto() {
  const db = await photoDatabase();
  const photo = await new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).openCursor(null, 'prev'); request.onsuccess = () => resolve(request.result?.value); request.onerror = () => reject(request.error); });
  db.close(); return photo;
}
async function removePhoto(id) {
  const db = await photoDatabase();
  await new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
}
function setCurrentPhoto(photo) {
  currentPhoto = photo; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = URL.createObjectURL(photo.blob);
  lastPhotoImage.src = photoUrl; previewImage.src = photoUrl; downloadPhoto.href = photoUrl; downloadPhoto.download = `FaceUp-${photo.id}.jpg`; lastPhoto.hidden = false;
}
async function refreshLastPhoto() {
  try {
    const photo = await loadLatestPhoto();
    if (photo) setCurrentPhoto(photo); else { currentPhoto = undefined; lastPhoto.hidden = true; }
  } catch { /* Камера продолжит работать, даже если хранилище временно недоступно. */ }
}
function showMessage(text, duration = 0) {
  window.clearTimeout(messageTimer); message.textContent = text;
  if (duration) messageTimer = window.setTimeout(() => { if (message.textContent === text) message.textContent = ''; }, duration);
}
function updateViewerTransform() { previewImage.style.transform = `translate(${viewerX}px, ${viewerY}px) scale(${viewerScale})`; }
function resetViewerZoom() { viewerScale = 1; viewerX = 0; viewerY = 0; updateViewerTransform(); }
function constrainViewerPosition() {
  const stage = photoStage.getBoundingClientRect(); const maxX = stage.width * (viewerScale - 1) / 2; const maxY = stage.height * (viewerScale - 1) / 2;
  viewerX = Math.max(-maxX, Math.min(maxX, viewerX)); viewerY = Math.max(-maxY, Math.min(maxY, viewerY));
}
function zoomPhotoAt(scale, clientX, clientY) {
  const nextScale = Math.min(5, Math.max(1, scale)); const stage = photoStage.getBoundingClientRect();
  const focalX = clientX - stage.left - stage.width / 2; const focalY = clientY - stage.top - stage.height / 2;
  const ratio = nextScale / viewerScale; viewerX = focalX - ratio * (focalX - viewerX); viewerY = focalY - ratio * (focalY - viewerY);
  viewerScale = nextScale; constrainViewerPosition(); updateViewerTransform();
}
function touchDistance(touches) { return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY); }
function touchMidpoint(touches) { return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 }; }
function openViewer() { if (currentPhoto) { resetViewerZoom(); viewer.hidden = false; } }
function flashScreen() { flash.classList.remove('active'); void flash.offsetWidth; flash.classList.add('active'); }

function setZoom(value) {
  const z = Number(value); video.style.transform = facingMode === 'user' ? `scale(${-z}, ${z})` : `scale(${z})`;
  zoom.value = z; zoomValue.value = `${z.toFixed(1)}×`; zoomValue.textContent = `${z.toFixed(1)}×`;
}
async function openCamera() {
  message.textContent = '';
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Ваш браузер не поддерживает доступ к камере.');
  stream?.getTracks().forEach(track => track.stop());
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  video.srcObject = stream; await video.play(); panel.hidden = true; capture.disabled = false; switchCamera.disabled = false; zoom.disabled = false; setZoom(1);
}
start.addEventListener('click', async () => { try { await openCamera(); } catch (error) { message.textContent = error.message || 'Не удалось открыть камеру. Проверьте разрешение в браузере.'; } });
switchCamera.addEventListener('click', async () => { facingMode = facingMode === 'user' ? 'environment' : 'user'; try { await openCamera(); } catch (error) { message.textContent = 'Не удалось переключить камеру.'; } });
zoom.addEventListener('input', event => setZoom(event.target.value));
capture.addEventListener('click', () => {
  if (!video.videoWidth) return;
  flashScreen();
  const canvas = document.createElement('canvas'); const width = video.videoWidth; const height = video.videoHeight; const z = Number(zoom.value);
  canvas.width = width; canvas.height = height; const context = canvas.getContext('2d');
  context.translate(width / 2, height / 2); context.scale(facingMode === 'user' ? -z : z, z); context.drawImage(video, -width / 2, -height / 2, width, height);
  canvas.toBlob(async blob => { if (!blob) return; try { setCurrentPhoto(await savePhoto(blob)); showMessage('Снимок сохранён в FaceUp.', 2500); } catch { showMessage('Не удалось сохранить снимок.'); } }, 'image/jpeg', 0.95);
});
lastPhoto.addEventListener('click', openViewer); backToCamera.addEventListener('click', () => { viewer.hidden = true; });
previewImage.addEventListener('touchstart', event => {
  if (event.touches.length === 2) { pinchStartDistance = touchDistance(event.touches); pinchStartScale = viewerScale; event.preventDefault(); }
  if (event.touches.length === 1 && viewerScale > 1) { dragStartX = event.touches[0].clientX; dragStartY = event.touches[0].clientY; dragStartOffsetX = viewerX; dragStartOffsetY = viewerY; event.preventDefault(); }
}, { passive: false });
previewImage.addEventListener('touchmove', event => {
  if (event.touches.length === 2 && pinchStartDistance) { const point = touchMidpoint(event.touches); zoomPhotoAt(pinchStartScale * touchDistance(event.touches) / pinchStartDistance, point.x, point.y); event.preventDefault(); }
  if (event.touches.length === 1 && dragStartX !== undefined) { viewerX = dragStartOffsetX + event.touches[0].clientX - dragStartX; viewerY = dragStartOffsetY + event.touches[0].clientY - dragStartY; constrainViewerPosition(); updateViewerTransform(); event.preventDefault(); }
}, { passive: false });
previewImage.addEventListener('touchend', event => { if (event.touches.length < 2) pinchStartDistance = undefined; if (!event.touches.length) dragStartX = undefined; });
sharePhoto.addEventListener('click', async () => {
  if (!currentPhoto) return; const file = new File([currentPhoto.blob], `FaceUp-${currentPhoto.id}.jpg`, { type: 'image/jpeg' });
  if (!navigator.canShare?.({ files: [file] })) { message.textContent = 'На этом устройстве используйте «Сохранить файл».'; return; }
  try { await navigator.share({ files: [file], title: 'FaceUp' }); } catch { /* Пользователь мог закрыть окно выбора. */ }
});
deletePhoto.addEventListener('click', async () => {
  if (!currentPhoto || !confirm('Удалить этот снимок из хранилища FaceUp?')) return;
  try {
    await removePhoto(currentPhoto.id); const nextPhoto = await loadLatestPhoto(); viewer.hidden = true;
    if (nextPhoto) setCurrentPhoto(nextPhoto); else { currentPhoto = undefined; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = undefined; lastPhoto.hidden = true; }
    showMessage('Снимок удалён из FaceUp.', 2500);
  } catch { showMessage('Не удалось удалить снимок.'); }
});
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; install.hidden = false; });
install.addEventListener('click', async () => { deferredInstall?.prompt(); await deferredInstall?.userChoice; deferredInstall = null; install.hidden = true; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=1.17.0');
refreshLastPhoto();
window.addEventListener('pageshow', refreshLastPhoto);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLastPhoto(); });
