// Конфигурация Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCbsllvaFUCb84KkqPxsrhEkBMPFbeeQNc",
  authDomain: "volgodonsk-lights.firebaseapp.com",
  databaseURL: "https://volgodonsk-lights-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "volgodonsk-lights",
  storageBucket: "volgodonsk-lights.appspot.com",
  messagingSenderId: "317295312829",
  appId: "1:317295312829:web:b639f1157c1268808c5cd4"
};

// Глобальные переменные
let map;
let database;
let activePlacemarks = {};
let currentPlacemarkType = null;
let clickHandler = null;
let actionHistory = [];
let currentHistoryIndex = -1;
let isProcessing = false;

// Цвета для разных типов фонарей
const COLORS = {
  green: '#4CAF50',
  orange: '#FF9800',
  blue: '#2196F3'
};

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
  if (typeof ymaps === 'undefined') {
    showNotification('Яндекс.Карты не загрузились', 'error');
    return;
  }
  
  initFirebase();
  ymaps.ready(initMap);
});

// Инициализация карты
function initMap() {
  try {
    map = new ymaps.Map("map", {
      center: [47.5166, 42.1514],
      zoom: 13,
      controls: ['zoomControl', 'fullscreenControl']
    });

    // Назначаем обработчики кнопок
    document.getElementById('green').addEventListener('click', () => setPlacemarkMode('green'));
    document.getElementById('orange').addEventListener('click', () => setPlacemarkMode('orange'));
    document.getElementById('blue').addEventListener('click', () => setPlacemarkMode('blue'));
    document.getElementById('clear').addEventListener('click', clearMapWithConfirmation);
    document.getElementById('undo').addEventListener('click', undoAction);
    document.getElementById('redo').addEventListener('click', redoAction);
    
    // Горячие клавиши
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undoAction();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redoAction();
      }
    });
    
    // Загрузка существующих меток
    loadPlacemarks();
    
    // Обработчик правого клика по карте
    map.events.add('contextmenu', (e) => {
      const target = e.get('target');
      if (target && target.properties) {
        const id = target.properties.get('id');
        if (id) {
          e.preventDefault();
          deletePlacemarkWithConfirmation(id);
        }
      }
    });
    
    updateStatus('Карта готова к работе');
  } catch (error) {
    console.error('Ошибка инициализации карты:', error);
    showNotification('Ошибка загрузки карты', 'error');
  }
}

// Инициализация Firebase
function initFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log("Firebase initialized");
  } catch (error) {
    console.error("Ошибка инициализации Firebase:", error);
    showNotification('Ошибка подключения к базе данных', 'error');
  }
}

// Создание метки на карте
function createPlacemarkOnMap(coords, type, id) {
  const placemark = new ymaps.Placemark(coords, {
    hintContent: getTypeDescription(type),
    balloonContent: `
      <b>Тип:</b> ${getTypeDescription(type)}<br>
      <b>Координаты:</b> ${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}<br>
      <b>ID:</b> ${id.slice(0, 8)}
    `
  }, {
    preset: 'islands#circleIcon',
    iconColor: COLORS[type],
    iconGlyph: 'lightbulb',
    iconGlyphColor: '#ffffff',
    iconSize: [32, 32]
  });

  // Сохраняем ID в свойствах метки
  placemark.properties.set('id', id);
  
  map.geoObjects.add(placemark);
  activePlacemarks[id] = placemark;
  return placemark;
}

// Подтверждение удаления метки
function deletePlacemarkWithConfirmation(id) {
  if (confirm('Вы уверены, что хотите удалить этот фонарь?')) {
    deletePlacemark(id);
  }
}

// Функция для добавления действия в историю
function addToHistory(action) {
  // Удаляем все действия после текущего индекса
  actionHistory = actionHistory.slice(0, currentHistoryIndex + 1);
  actionHistory.push(action);
  currentHistoryIndex = actionHistory.length - 1;
  updateUndoRedoButtons();
}

// Удаление метки
async function deletePlacemark(id) {
  if (isProcessing) return;
  
  try {
    isProcessing = true;
    showLoader(true);
    
    // Сначала получаем данные метки
    const snapshot = await database.ref(`placemarks/${id}`).once('value');
    const placemarkData = snapshot.val();
    
    if (!placemarkData) {
      showNotification('Фонарь не найден', 'error');
      return;
    }
    
    // Удаляем из базы
    await database.ref(`placemarks/${id}`).remove();
    
    // Удаляем с карты
    if (activePlacemarks[id]) {
      map.geoObjects.remove(activePlacemarks[id]);
      delete activePlacemarks[id];
    }
    
    // Добавляем в историю
    addToHistory({
      type: 'remove',
      id: id,
      data: placemarkData
    });
    
    showNotification('Фонарь удален', 'success');
  } catch (error) {
    console.error("Ошибка удаления:", error);
    showNotification('Ошибка при удалении фонаря', 'error');
  } finally {
    isProcessing = false;
    showLoader(false);
  }
}

// Добавление метки
async function addPlacemark(coords, type) {
  if (isProcessing || !currentPlacemarkType) return;
  
  try {
    isProcessing = true;
    showLoader(true);
    
    const newRef = database.ref('placemarks/').push();
    const placemarkData = {
      coords: coords,
      type: type,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    await newRef.set(placemarkData);
    createPlacemarkOnMap(coords, type, newRef.key);
    
    // Добавляем в историю
    addToHistory({
      type: 'add',
      id: newRef.key,
      data: placemarkData
    });
    
    showNotification('Фонарь добавлен', 'success');
  } catch (error) {
    console.error("Ошибка добавления метки:", error);
    showNotification('Ошибка при добавлении фонаря', 'error');
  } finally {
    isProcessing = false;
    showLoader(false);
  }
}

// Загрузка меток из базы
function loadPlacemarks() {
  database.ref('placemarks').on('value', (snapshot) => {
    const data = snapshot.val() || {};
    
    // Удаляем старые метки
    Object.keys(activePlacemarks).forEach(id => {
      if (!data[id]) {
        map.geoObjects.remove(activePlacemarks[id]);
        delete activePlacemarks[id];
      }
    });
    
    // Добавляем новые
    Object.entries(data).forEach(([id, placemark]) => {
      if (!activePlacemarks[id]) {
        createPlacemarkOnMap(placemark.coords, placemark.type, id);
      }
    });
  });
}

// Отмена действия
async function undoAction() {
  if (currentHistoryIndex < 0 || isProcessing) return;

  isProcessing = true;
  showLoader(true);
  
  try {
    const action = actionHistory[currentHistoryIndex];
    
    // В зависимости от типа действия выполняем обратную операцию
    switch (action.type) {
      case 'add':
        // Отмена добавления = удаление
        await database.ref(`placemarks/${action.id}`).remove();
        if (activePlacemarks[action.id]) {
          map.geoObjects.remove(activePlacemarks[action.id]);
          delete activePlacemarks[action.id];
        }
        break;
        
      case 'remove':
        // Отмена удаления = добавление
        await database.ref(`placemarks/${action.id}`).set(action.data);
        createPlacemarkOnMap(action.data.coords, action.data.type, action.id);
        break;
    }
    
    currentHistoryIndex--;
    updateUndoRedoButtons();
    showNotification('Действие отменено', 'success');
  } catch (error) {
    console.error("Ошибка при отмене:", error);
    showNotification('Ошибка при отмене действия', 'error');
  } finally {
    isProcessing = false;
    showLoader(false);
  }
}

// Повтор действия
async function redoAction() {
  if (currentHistoryIndex >= actionHistory.length - 1 || isProcessing) return;

  isProcessing = true;
  showLoader(true);
  
  try {
    currentHistoryIndex++;
    const action = actionHistory[currentHistoryIndex];
    
    // Повторяем оригинальное действие
    switch (action.type) {
      case 'add':
        await database.ref(`placemarks/${action.id}`).set(action.data);
        createPlacemarkOnMap(action.data.coords, action.data.type, action.id);
        break;
        
      case 'remove':
        await database.ref(`placemarks/${action.id}`).remove();
        if (activePlacemarks[action.id]) {
          map.geoObjects.remove(activePlacemarks[action.id]);
          delete activePlacemarks[action.id];
        }
        break;
    }
    
    updateUndoRedoButtons();
    showNotification('Действие возвращено', 'success');
  } catch (error) {
    console.error("Ошибка при возврате:", error);
    showNotification('Ошибка при возврате действия', 'error');
    currentHistoryIndex--;
  } finally {
    isProcessing = false;
    showLoader(false);
  }
}

// Очистка карты
async function clearMapWithConfirmation() {
  if (confirm('Вы уверены, что хотите очистить карту?')) {
    try {
      showLoader(true);
      await database.ref('placemarks').remove();
      showNotification('Карта очищена', 'success');
    } catch (error) {
      console.error("Ошибка очистки:", error);
      showNotification('Ошибка при очистке карты', 'error');
    } finally {
      showLoader(false);
    }
  }
}

// Обновление состояния кнопок
function updateUndoRedoButtons() {
  document.getElementById('undo').disabled = currentHistoryIndex < 0;
  document.getElementById('redo').disabled = currentHistoryIndex >= actionHistory.length - 1;
}

// Установка режима добавления метки
function setPlacemarkMode(type) {
  resetPlacemarkMode();
  currentPlacemarkType = type;
  updateStatus(`Режим добавления: ${getTypeDescription(type)}. Кликните на карту.`);
  
  clickHandler = map.events.add('click', async (e) => {
    const coords = e.get('coords');
    await addPlacemark(coords, type);
  });
}

// Сброс режима добавления метки
function resetPlacemarkMode() {
  if (clickHandler) {
    map.events.remove(clickHandler);
    clickHandler = null;
  }
  currentPlacemarkType = null;
}

// Вспомогательные функции
function getTypeDescription(type) {
  const types = {
    green: 'До 2021 года',
    orange: '2021-2025 года',
    blue: 'Плановые'
  };
  return types[type] || 'Неизвестный тип';
}

function updateStatus(message, type = 'info') {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = type;
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

function showLoader(show) {
  document.getElementById('loader').classList.toggle('active', show);
}