const video = document.querySelector('#video');
const start = document.querySelector('#start');
const switchCamera = document.querySelector('#switch');
const controls = document.querySelector('#controls');
const panel = document.querySelector('#startPanel');
const message = document.querySelector('#message');
const install = document.querySelector('#install');
const capture = document.querySelector('#capture');
const lastPhoto = document.querySelector('#lastPhoto');
const lastPhotoImage = document.querySelector('#lastPhotoImage');
const viewer = document.querySelector('#viewer');
const previewImage = document.querySelector('#previewImage');
const backToCamera = document.querySelector('#backToCamera');
const downloadPhoto = document.querySelector('#downloadPhoto');
const sharePhoto = document.querySelector('#sharePhoto');
const deletePhoto = document.querySelector('#deletePhoto');
let stream; let facingMode = 'user'; let deferredInstall; let currentPhoto; let photoUrl;

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
function openViewer() { if (currentPhoto) viewer.hidden = false; }

function updateCameraTransform() { video.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none'; }
async function openCamera() {
  message.textContent = '';
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Ваш браузер не поддерживает доступ к камере.');
  stream?.getTracks().forEach(track => track.stop());
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  video.srcObject = stream; await video.play(); panel.hidden = true; controls.hidden = false; updateCameraTransform();
}
start.addEventListener('click', async () => { try { await openCamera(); } catch (error) { message.textContent = error.message || 'Не удалось открыть камеру. Проверьте разрешение в браузере.'; } });
switchCamera.addEventListener('click', async () => { facingMode = facingMode === 'user' ? 'environment' : 'user'; try { await openCamera(); } catch (error) { message.textContent = 'Не удалось переключить камеру.'; } });
capture.addEventListener('click', () => {
  if (!video.videoWidth) return;
  const canvas = document.createElement('canvas'); const width = video.videoWidth; const height = video.videoHeight;
  canvas.width = width; canvas.height = height; const context = canvas.getContext('2d');
  context.translate(width / 2, height / 2); context.scale(facingMode === 'user' ? -1 : 1, 1); context.drawImage(video, -width / 2, -height / 2, width, height);
  canvas.toBlob(async blob => { if (!blob) return; try { setCurrentPhoto(await savePhoto(blob)); message.textContent = 'Снимок сохранён в FaceUp.'; } catch { message.textContent = 'Не удалось сохранить снимок.'; } }, 'image/jpeg', 0.95);
});
lastPhoto.addEventListener('click', openViewer); backToCamera.addEventListener('click', () => { viewer.hidden = true; });
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
    message.textContent = 'Снимок удалён из FaceUp.';
    window.setTimeout(() => { if (message.textContent === 'Снимок удалён из FaceUp.') message.textContent = ''; }, 2500);
  } catch { message.textContent = 'Не удалось удалить снимок.'; }
});
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; install.hidden = false; });
install.addEventListener('click', async () => { deferredInstall?.prompt(); await deferredInstall?.userChoice; deferredInstall = null; install.hidden = true; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=1.10.0');
loadLatestPhoto().then(photo => { if (photo) setCurrentPhoto(photo); }).catch(() => { /* Камера продолжит работать, даже если хранилище недоступно. */ });
