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
const transitionImage = document.querySelector('#transitionImage');
const thumbnailStrip = document.querySelector('#thumbnailStrip');
const downloadPhoto = document.querySelector('#downloadPhoto');
const sharePhoto = document.querySelector('#sharePhoto');
const deletePhoto = document.querySelector('#deletePhoto');
let stream; let facingMode = 'user'; let deferredInstall; let currentPhoto; let photoUrl;
let messageTimer; let viewerScale = 1; let viewerX = 0; let viewerY = 0; let pinchStartDistance; let pinchStartScale; let dragStartX; let dragStartY; let dragStartOffsetX; let dragStartOffsetY; let swipeStartX; let swipeStartY; let swipeOffsetX = 0; let swipeDirection; let swipeTarget; let swipeRequest = 0; let thumbnailUrls = []; let transitionUrl; let transitionTimer; let swipeTimer; let cameraZoomSnap;

const DB_NAME = 'faceup';
const STORE_NAME = 'photos';
const ZOOM_SNAP_POINTS = [2, 3, 5, 7];
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
async function loadAllPhotos() {
  const db = await photoDatabase(); const photos = [];
  await new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).openCursor(null, 'prev'); request.onsuccess = () => { const cursor = request.result; if (cursor) { photos.push(cursor.value); cursor.continue(); } else resolve(); }; request.onerror = () => reject(request.error); });
  db.close(); return photos;
}
async function loadAdjacentPhoto(id, direction) {
  const db = await photoDatabase(); const range = direction === 'previous' ? IDBKeyRange.upperBound(id, true) : IDBKeyRange.lowerBound(id, true);
  const cursorDirection = direction === 'previous' ? 'prev' : 'next';
  const photo = await new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).openCursor(range, cursorDirection); request.onsuccess = () => resolve(request.result?.value); request.onerror = () => reject(request.error); });
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
  renderPhotoStrip(photo.id);
}
function selectThumbnail(id, behavior = 'smooth') {
  const selected = thumbnailStrip.querySelector(`.gallery-thumbnail[data-photo-id="${id}"]`);
  if (!selected) return false;
  thumbnailStrip.querySelector('.gallery-thumbnail.selected')?.classList.remove('selected');
  selected.classList.add('selected');
  selected.scrollIntoView({ block: 'nearest', inline: 'center', behavior });
  return true;
}
async function renderPhotoStrip(id) {
  if (selectThumbnail(id)) return;
  try {
    const photos = await loadAllPhotos(); if (currentPhoto?.id !== id) return;
    thumbnailUrls.forEach(url => URL.revokeObjectURL(url)); thumbnailUrls = [];
    const fragment = document.createDocumentFragment();
    photos.forEach(photo => {
      const button = document.createElement('button'); button.className = 'gallery-thumbnail'; button.dataset.photoId = photo.id; button.setAttribute('aria-label', 'Открыть снимок');
      const image = document.createElement('img'); const url = URL.createObjectURL(photo.blob); thumbnailUrls.push(url); image.src = url; image.alt = ''; button.append(image);
      button.addEventListener('click', () => { showPhoto(photo, photo.id < currentPhoto.id ? 'left' : 'right'); }); fragment.append(button);
    });
    thumbnailStrip.replaceChildren(fragment); selectThumbnail(id, 'auto');
  } catch { thumbnailStrip.replaceChildren(); }
}
async function refreshLastPhoto() {
  try {
    const photo = await loadLatestPhoto();
    if (photo) setCurrentPhoto(photo); else { currentPhoto = undefined; lastPhoto.hidden = true; thumbnailStrip.replaceChildren(); }
  } catch { /* Камера продолжит работать, даже если хранилище временно недоступно. */ }
}
function showMessage(text, duration = 0) {
  window.clearTimeout(messageTimer); message.textContent = text;
  if (duration) messageTimer = window.setTimeout(() => { if (message.textContent === text) message.textContent = ''; }, duration);
}
function snapZoom(value, lockedSnap) {
  if (lockedSnap && Math.abs(value - lockedSnap) <= 0.24) return lockedSnap;
  return ZOOM_SNAP_POINTS.find(point => Math.abs(value - point) <= 0.12);
}
function updateViewerTransform() { previewImage.style.transform = `translate(${viewerX}px, ${viewerY}px) scale(${viewerScale})`; }
function resetViewerZoom() { viewerScale = 1; viewerX = 0; viewerY = 0; updateViewerTransform(); }
function constrainViewerPosition() {
  const stage = photoStage.getBoundingClientRect(); const extraScale = Math.max(0, viewerScale - 1); const maxX = stage.width * extraScale / 2; const maxY = stage.height * extraScale / 2;
  viewerX = Math.max(-maxX, Math.min(maxX, viewerX)); viewerY = Math.max(-maxY, Math.min(maxY, viewerY));
}
function zoomPhotoAt(scale, clientX, clientY) {
  const nextScale = Math.min(10, Math.max(0.86, scale)); const stage = photoStage.getBoundingClientRect();
  const focalX = clientX - stage.left - stage.width / 2; const focalY = clientY - stage.top - stage.height / 2;
  const ratio = nextScale / viewerScale; viewerX = focalX - ratio * (focalX - viewerX); viewerY = focalY - ratio * (focalY - viewerY);
  viewerScale = nextScale; if (viewerScale < 1) { viewerX = 0; viewerY = 0; } else constrainViewerPosition(); updateViewerTransform();
}
function settleViewerZoom() {
  if (viewerScale >= 1) return;
  previewImage.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
  viewerScale = 1; viewerX = 0; viewerY = 0; updateViewerTransform(); navigator.vibrate?.(12);
  window.setTimeout(() => { previewImage.style.transition = ''; }, 190);
}
function touchDistance(touches) { return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY); }
function touchMidpoint(touches) { return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 }; }
function closeViewer() { viewer.hidden = true; resetViewerZoom(); refreshLastPhoto(); }
function openViewer() { if (currentPhoto) { resetViewerZoom(); viewer.hidden = false; history.pushState({ faceUpViewer: true }, '', location.href); } }
function flashScreen() { flash.classList.remove('active'); void flash.offsetWidth; flash.classList.add('active'); }
function showPhoto(photo, direction) {
  if (!currentPhoto || viewer.hidden || viewerScale > 1 || currentPhoto.id === photo.id) { setCurrentPhoto(photo); resetViewerZoom(); return; }
  window.clearTimeout(transitionTimer); if (transitionUrl) URL.revokeObjectURL(transitionUrl); transitionUrl = URL.createObjectURL(currentPhoto.blob);
  transitionImage.src = transitionUrl; transitionImage.hidden = false; transitionImage.className = `transition-image slide-out-${direction}`;
  setCurrentPhoto(photo); resetViewerZoom(); previewImage.classList.remove('slide-in-left', 'slide-in-right'); void previewImage.offsetWidth; previewImage.classList.add(`slide-in-${direction === 'left' ? 'right' : 'left'}`);
  transitionTimer = window.setTimeout(async () => { try { await previewImage.decode(); } catch { /* Изображение всё равно отобразится по событию load. */ } transitionImage.hidden = true; transitionImage.className = 'transition-image'; previewImage.classList.remove('slide-in-left', 'slide-in-right'); if (transitionUrl) { URL.revokeObjectURL(transitionUrl); transitionUrl = undefined; } }, 260);
}
function clearSwipePreview() {
  window.clearTimeout(swipeTimer); ++swipeRequest; previewImage.style.transition = ''; updateViewerTransform(); transitionImage.hidden = true; transitionImage.style.transition = ''; transitionImage.style.transform = ''; transitionImage.className = 'transition-image';
  if (transitionUrl) { URL.revokeObjectURL(transitionUrl); transitionUrl = undefined; } swipeTarget = undefined; swipeDirection = undefined;
}
function positionSwipePreview(offset) {
  swipeOffsetX = offset;
  if (!swipeTarget) { const edgeOffset = Math.sign(offset) * Math.min(48, Math.abs(offset) * 0.22); previewImage.style.transform = `translate(${edgeOffset}px, 0) scale(1)`; return; }
  previewImage.style.transform = `translate(${offset}px, 0) scale(1)`; const stageWidth = photoStage.getBoundingClientRect().width;
  transitionImage.style.transform = `translate(${(swipeDirection === 'left' ? stageWidth : -stageWidth) + offset}px, 0)`;
}
async function prepareSwipeTarget(direction) {
  if (!currentPhoto || swipeDirection === direction) return; swipeDirection = direction; swipeTarget = undefined;
  const request = ++swipeRequest; if (transitionUrl) { URL.revokeObjectURL(transitionUrl); transitionUrl = undefined; } transitionImage.hidden = true;
  const photo = await loadAdjacentPhoto(currentPhoto.id, direction === 'left' ? 'previous' : 'next');
  if (request !== swipeRequest || swipeDirection !== direction || !photo) return;
  swipeTarget = photo; transitionUrl = URL.createObjectURL(photo.blob); transitionImage.src = transitionUrl; transitionImage.hidden = false; positionSwipePreview(swipeOffsetX);
}
function finishSwipe() {
  if (!swipeTarget || Math.abs(swipeOffsetX) < 50) {
    const stageWidth = photoStage.getBoundingClientRect().width; previewImage.style.transition = 'transform .18s ease-out'; previewImage.style.transform = 'translate(0, 0) scale(1)';
    if (swipeTarget) { transitionImage.style.transition = 'transform .18s ease-out'; transitionImage.style.transform = `translate(${swipeDirection === 'left' ? stageWidth : -stageWidth}px, 0)`; }
    swipeTimer = window.setTimeout(clearSwipePreview, 190); return;
  }
  const target = swipeTarget; const direction = swipeDirection; const stageWidth = photoStage.getBoundingClientRect().width;
  previewImage.style.transition = 'transform .18s ease-out'; transitionImage.style.transition = 'transform .18s ease-out';
  previewImage.style.transform = `translate(${direction === 'left' ? -stageWidth : stageWidth}px, 0) scale(1)`; transitionImage.style.transform = 'translate(0, 0)'; selectThumbnail(target.id);
  swipeTimer = window.setTimeout(async () => { setCurrentPhoto(target); try { await previewImage.decode(); } catch { /* Переходный слой сохранит изображение до загрузки. */ } if (currentPhoto?.id === target.id) { clearSwipePreview(); resetViewerZoom(); } }, 190);
}
async function autoStartCamera() {
  if (!navigator.permissions?.query) { panel.hidden = false; return; }
  try { if ((await navigator.permissions.query({ name: 'camera' })).state === 'granted') await openCamera(); else panel.hidden = false; } catch { panel.hidden = false; }
}

function setZoom(value) {
  const requestedZoom = Number(value); const nextSnap = snapZoom(requestedZoom, cameraZoomSnap);
  if (nextSnap && nextSnap !== cameraZoomSnap) navigator.vibrate?.(8);
  cameraZoomSnap = nextSnap; const z = nextSnap || requestedZoom; video.style.transform = facingMode === 'user' ? `scale(${-z}, ${z})` : `scale(${z})`;
  zoom.value = z; zoomValue.value = `${z.toFixed(1)}×`; zoomValue.textContent = `${z.toFixed(1)}×`;
}
async function openCamera() {
  message.textContent = '';
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Ваш браузер не поддерживает доступ к камере.');
  stream?.getTracks().forEach(track => track.stop());
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  video.srcObject = stream; await video.play(); panel.hidden = true; capture.disabled = false; switchCamera.disabled = false; zoom.disabled = false; cameraZoomSnap = undefined; setZoom(1);
}
start.addEventListener('click', async () => { try { await openCamera(); } catch (error) { message.textContent = error.message || 'Не удалось открыть камеру. Проверьте разрешение в браузере.'; } });
switchCamera.addEventListener('click', async () => { facingMode = facingMode === 'user' ? 'environment' : 'user'; try { await openCamera(); } catch (error) { message.textContent = 'Не удалось переключить камеру.'; } });
zoom.addEventListener('input', event => setZoom(event.target.value));
capture.addEventListener('click', () => {
  if (!video.videoWidth) return;
  flashScreen(); navigator.vibrate?.(10);
  const canvas = document.createElement('canvas'); const width = video.videoWidth; const height = video.videoHeight; const z = Number(zoom.value);
  canvas.width = width; canvas.height = height; const context = canvas.getContext('2d');
  context.translate(width / 2, height / 2); context.scale(facingMode === 'user' ? -z : z, z); context.drawImage(video, -width / 2, -height / 2, width, height);
  canvas.toBlob(async blob => { if (!blob) return; try { setCurrentPhoto(await savePhoto(blob)); } catch { showMessage('Не удалось сохранить снимок.'); } }, 'image/jpeg', 0.95);
});
lastPhoto.addEventListener('click', openViewer);
previewImage.addEventListener('touchstart', event => {
  if (event.touches.length === 2) { clearSwipePreview(); swipeStartX = undefined; swipeStartY = undefined; pinchStartDistance = touchDistance(event.touches); pinchStartScale = viewerScale; event.preventDefault(); }
  if (event.touches.length === 1 && viewerScale > 1) { dragStartX = event.touches[0].clientX; dragStartY = event.touches[0].clientY; dragStartOffsetX = viewerX; dragStartOffsetY = viewerY; event.preventDefault(); }
  if (event.touches.length === 1 && viewerScale === 1) { clearSwipePreview(); swipeStartX = event.touches[0].clientX; swipeStartY = event.touches[0].clientY; swipeOffsetX = 0; }
}, { passive: false });
previewImage.addEventListener('touchmove', event => {
  if (event.touches.length === 2 && pinchStartDistance) { const point = touchMidpoint(event.touches); zoomPhotoAt(pinchStartScale * touchDistance(event.touches) / pinchStartDistance, point.x, point.y); event.preventDefault(); }
  if (event.touches.length === 1 && dragStartX !== undefined) { viewerX = dragStartOffsetX + event.touches[0].clientX - dragStartX; viewerY = dragStartOffsetY + event.touches[0].clientY - dragStartY; constrainViewerPosition(); updateViewerTransform(); event.preventDefault(); }
  if (event.touches.length === 1 && swipeStartX !== undefined) { const offset = event.touches[0].clientX - swipeStartX; const offsetY = event.touches[0].clientY - swipeStartY; if (Math.abs(offset) > Math.abs(offsetY)) { const direction = offset < 0 ? 'left' : 'right'; prepareSwipeTarget(direction); positionSwipePreview(offset); event.preventDefault(); } }
}, { passive: false });
previewImage.addEventListener('touchend', event => {
  if (event.touches.length < 2) { pinchStartDistance = undefined; settleViewerZoom(); }
  if (!event.touches.length) {
    dragStartX = undefined;
    if (swipeStartX !== undefined) { finishSwipe(); swipeStartX = undefined; }
  }
});
sharePhoto.addEventListener('click', async () => {
  if (!currentPhoto) return; const file = new File([currentPhoto.blob], `FaceUp-${currentPhoto.id}.jpg`, { type: 'image/jpeg' });
  if (!navigator.canShare?.({ files: [file] })) { message.textContent = 'На этом устройстве используйте «Сохранить файл».'; return; }
  try { await navigator.share({ files: [file], title: 'FaceUp' }); } catch { /* Пользователь мог закрыть окно выбора. */ }
});
deletePhoto.addEventListener('click', async () => {
  if (!currentPhoto || !confirm('Удалить этот снимок из хранилища FaceUp?')) return;
  try {
    const removedId = currentPhoto.id; const replacement = await loadAdjacentPhoto(removedId, 'next') || await loadAdjacentPhoto(removedId, 'previous');
    await removePhoto(removedId); thumbnailStrip.querySelector(`.gallery-thumbnail[data-photo-id="${removedId}"]`)?.remove();
    if (replacement) setCurrentPhoto(replacement); else { viewer.hidden = true; currentPhoto = undefined; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = undefined; lastPhoto.hidden = true; thumbnailStrip.replaceChildren(); }
  } catch { showMessage('Не удалось удалить снимок.'); }
});
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; install.hidden = false; });
install.addEventListener('click', async () => { deferredInstall?.prompt(); await deferredInstall?.userChoice; deferredInstall = null; install.hidden = true; });
window.addEventListener('popstate', () => {
  if (viewer.hidden) return;
  if (viewerScale > 1) { resetViewerZoom(); history.pushState({ faceUpViewer: true }, '', location.href); } else closeViewer();
});
async function prepareOfflineMode() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    await navigator.storage?.persist?.();
  } catch { /* Приложение продолжит работать онлайн, если браузер не поддерживает PWA. */ }
}
prepareOfflineMode();
refreshLastPhoto();
autoStartCamera();
window.addEventListener('pageshow', refreshLastPhoto);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLastPhoto(); });
