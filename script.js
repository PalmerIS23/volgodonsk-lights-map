ymaps.ready(init);

function init() {
    const map = new ymaps.Map("map", {
        center: [47.5166, 42.1514],
        zoom: 13
    });

    const colors = {
        green: '#4CAF50',
        orange: '#FF9800',
        blue: '#2196F3'
    };

    // Массив всех меток
    let placemarks = [];
    // История действий (для undo/redo)
    let history = [];
    let historyIndex = -1;

    // Загрузка меток из localStorage
    loadPlacemarks();

    // Обработчики кнопок
    document.getElementById('green').addEventListener('click', () => startAddingPlacemark('green'));
    document.getElementById('orange').addEventListener('click', () => startAddingPlacemark('orange'));
    document.getElementById('blue').addEventListener('click', () => startAddingPlacemark('blue'));
    document.getElementById('undo').addEventListener('click', undoAction);
    document.getElementById('redo').addEventListener('click', redoAction);
    document.getElementById('clear').addEventListener('click', clearMap);

    // Горячие клавиши (Ctrl+Z / Ctrl+Y)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') undoAction();
        if (e.ctrlKey && e.key === 'y') redoAction();
    });

    // Функция начала добавления метки
    function startAddingPlacemark(type) {
        // Удаляем предыдущий обработчик (если был)
        map.events.remove('click', addPlacemarkHandler);
        // Добавляем новый обработчик
        map.events.add('click', addPlacemarkHandler);

        function addPlacemarkHandler(e) {
            const coords = e.get('coords');
            addPlacemark(coords, type);
            // Удаляем обработчик после добавления метки
            map.events.remove('click', addPlacemarkHandler);
        }
    }

    // Добавление метки
    function addPlacemark(coords, type) {
    const placemark = new ymaps.Placemark(coords, {
        hintContent: `Фонарь (${type})`,
        balloonContent: `Год: ${getYearByType(type)}`
    }, {
        // Настройки для фиксированного размера:
        iconLayout: 'default#image',
        iconImageHref: 'https://yastatic.net/s3/mapsapi-ru/3.3/2.1/images/circle.png',
        iconImageSize: [20, 20], // всегда 20x20 пикселей
        iconImageOffset: [-10, -10],
        iconColor: colors[type] // зеленый/оранжевый/голубой
    });

    map.geoObjects.add(placemark);
    placemarks.push(placemark);
    saveToHistory('add', placemark);
    savePlacemarks();
    }

    // Удаление метки
    function removePlacemark(placemark) {
        map.geoObjects.remove(placemark);
        placemarks = placemarks.filter(p => p !== placemark);
        savePlacemarks();
    }

    // Сохранение в историю
    function saveToHistory(action, placemark) {
        // Удаляем всё после текущего индекса (если сделали undo и потом новое действие)
        history = history.slice(0, historyIndex + 1);
        history.push({ action, placemark });
        historyIndex = history.length - 1;
    }

    // Отмена действия
    function undoAction() {
        if (historyIndex < 0) return;

        const entry = history[historyIndex];
        if (entry.action === 'add') {
            removePlacemark(entry.placemark);
        } else if (entry.action === 'remove') {
            map.geoObjects.add(entry.placemark);
            placemarks.push(entry.placemark);
        }
        historyIndex--;
        savePlacemarks();
    }

    // Повтор действия
    function redoAction() {
        if (historyIndex >= history.length - 1) return;

        historyIndex++;
        const entry = history[historyIndex];
        if (entry.action === 'add') {
            map.geoObjects.add(entry.placemark);
            placemarks.push(entry.placemark);
        } else if (entry.action === 'remove') {
            removePlacemark(entry.placemark);
        }
        savePlacemarks();
    }

    // Очистка карты
    function clearMap() {
        placemarks.forEach(placemark => {
            saveToHistory('remove', placemark);
            map.geoObjects.remove(placemark);
        });
        placemarks = [];
        savePlacemarks();
    }

    // Сохранение меток в localStorage
    function savePlacemarks() {
        const saved = placemarks.map(p => ({
            coords: p.geometry.getCoordinates(),
            type: Object.keys(colors).find(key => colors[key] === p.options.get('iconColor'))
        }));
        localStorage.setItem('placemarks', JSON.stringify(saved));
    }

    // Загрузка меток из localStorage
    function loadPlacemarks() {
        const saved = JSON.parse(localStorage.getItem('placemarks')) || [];
        saved.forEach(item => {
            const placemark = new ymaps.Placemark(item.coords, {
                hintContent: `Фонарь (${item.type})`,
                balloonContent: `Год: ${getYearByType(item.type)}`
            }, {
                preset: 'islands#circleIcon',
                iconColor: colors[item.type]
            });
            map.geoObjects.add(placemark);
            placemarks.push(placemark);
            saveToHistory('add', placemark);
        });
    }

    function getYearByType(type) {
        switch (type) {
            case 'green': return 'До 2021';
            case 'orange': return '2021-2025';
            case 'blue': return 'Плановый';
            default: return 'Неизвестно';
        }
    }
}