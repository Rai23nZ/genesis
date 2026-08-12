// Общая модель данных, импорт/экспорт и раскладки древа.
// Никакой вёрстки — только бизнес-логика, которую переиспользуют все три варианта.

export const PLACES = {
  "Тула": [54.19, 37.62], "Смоленск": [54.78, 32.05], "Москва": [55.75, 37.62],
  "Ленинград": [59.94, 30.31], "Санкт-Петербург": [59.94, 30.31], "Свердловск": [56.84, 60.61],
  "Екатеринбург": [56.84, 60.61], "Новосибирск": [55.03, 82.92], "Ташкент": [41.31, 69.24],
  "Алма-Ата": [43.24, 76.89], "Калининград": [54.71, 20.51], "Владивосток": [43.12, 131.89],
  "Берлин": [52.52, 13.40], "Прага": [50.09, 14.42], "Хайфа": [32.79, 34.99],
  "Торонто": [43.65, -79.38], "Белград": [44.79, 20.45], "Мурманск": [68.97, 33.08],
  "Сочи": [43.60, 39.73], "Тбилиси": [41.72, 44.79], "Рига": [56.95, 24.11],
  "Мюнхен": [48.14, 11.58], "Воронеж": [51.66, 39.20], "Ржев": [56.26, 34.33],
  "Караганда": [49.80, 73.10], "Нижний Новгород": [56.33, 44.00], "Лиссабон": [38.72, -9.14]
};

const P = (id, o) => Object.assign({ id, photos: [], residences: [], documents: [], sources: [], notes: "" }, o);

export const PEOPLE = [
  P("p1", {
    name: "Пётр Алексеевич Ковалёв", sex: "m", gen: 0, birth: { date: "1902-03-14", place: "Тула" }, death: { date: "1978-11-02", place: "Тула" },
    occupation: "Мастер инструментального цеха", employer: "Тульский оружейный завод",
    education: "Ремесленное училище при ТОЗ, 1919",
    military: "Трудовой фронт, 1941–1945. Медаль «За доблестный труд в Великой Отечественной войне»",
    residences: [{ place: "Тула", from: 1902, to: 1978, note: "ул. Металлистов, дом заводской постройки" }],
    photos: [{ caption: "Портрет, 1936", year: 1936 }, { caption: "У проходной завода, 1947", year: 1947 }, { caption: "С внуками, 1961", year: 1961 }],
    documents: ["Трудовая книжка, 1919–1962", "Свидетельство о браке, 1926"],
    sources: ["Архив ТОЗ, ф. 12 оп. 3", "Семейный альбом, коробка №1"],
    notes: "Всю жизнь проработал на одном заводе. Собирал стенные часы, три из них до сих пор в семье.",
    spouse: ["p2"], parents: []
  }),
  P("p2", {
    name: "Анна Михайловна Ковалёва", maiden: "Соколова", sex: "f", gen: 0, birth: { date: "1907-08-21", place: "Тула" }, death: { date: "1989-04-17", place: "Тула" },
    occupation: "Фельдшер", employer: "Городская больница №2",
    education: "Тульское медицинское училище, 1927",
    residences: [{ place: "Тула", from: 1907, to: 1989 }],
    photos: [{ caption: "Выпуск медучилища, 1927", year: 1927 }, { caption: "Портрет, 1950-е", year: 1955 }],
    sources: ["Метрическая книга Успенской церкви, 1907"],
    notes: "Вела домашнюю книгу расходов с 1930 по 1988 год — 58 тетрадей сохранились.",
    spouse: ["p1"], parents: []
  }),
  P("p3", {
    name: "Григорий Иванович Ланской", sex: "m", gen: 0, birth: { date: "1899-01-09", place: "Смоленск" }, death: { date: "1943-03-05", place: "Ржев" },
    occupation: "Землемер", employer: "Смоленский губернский земотдел",
    education: "Смоленское реальное училище",
    military: "Стрелковая дивизия, старший сержант. Погиб под Ржевом, март 1943",
    residences: [{ place: "Смоленск", from: 1899, to: 1941 }, { place: "Ржев", from: 1942, to: 1943, note: "фронт" }],
    photos: [{ caption: "Единственная сохранившаяся карточка, 1938", year: 1938 }],
    documents: ["Извещение о гибели, 1943", "Красноармейская книжка (копия)"],
    sources: ["ОБД «Мемориал», запись 51203877"],
    notes: "Место захоронения точно не установлено. Поиск продолжается.",
    spouse: ["p4"], parents: []
  }),
  P("p4", {
    name: "Евдокия Павловна Ланская", maiden: "Титова", sex: "f", gen: 0, birth: { date: "1905-06-30", place: "Смоленск" }, death: { date: "1982-12-11", place: "Москва" },
    occupation: "Учитель начальных классов", employer: "Школа №9, Смоленск",
    education: "Педагогический техникум, 1924",
    residences: [{ place: "Смоленск", from: 1905, to: 1941 }, { place: "Ташкент", from: 1941, to: 1945, note: "эвакуация с детьми" }, { place: "Смоленск", from: 1945, to: 1968 }, { place: "Москва", from: 1968, to: 1982 }],
    photos: [{ caption: "С классом, 1936", year: 1936 }, { caption: "Ташкент, 1943", year: 1943 }],
    notes: "Вывезла двоих детей в эвакуацию в Ташкент летом 1941 года. Дорога заняла 26 дней.",
    spouse: ["p3"], parents: []
  }),

  P("p5", {
    name: "Николай Петрович Ковалёв", sex: "m", gen: 1, birth: { date: "1928-05-02", place: "Тула" }, death: { date: "2001-09-30", place: "Москва" },
    occupation: "Инженер-конструктор", employer: "НИИ приборостроения, Москва",
    education: "МВТУ им. Баумана, 1953",
    military: "Срочная служба, Северный флот, 1948–1951, Мурманск",
    residences: [{ place: "Тула", from: 1928, to: 1946 }, { place: "Мурманск", from: 1948, to: 1951, note: "служба" }, { place: "Москва", from: 1951, to: 2001 }],
    photos: [{ caption: "Северный флот, 1949", year: 1949 }, { caption: "Защита диплома, 1953", year: 1953 }, { caption: "Семья на даче, 1972", year: 1972 }, { caption: "Портрет, 1990", year: 1990 }],
    documents: ["Диплом МВТУ №412330", "Авторское свидетельство на изобретение, 1968"],
    notes: "Четыре авторских свидетельства. Домашний архив чертежей передан внуку в 1999 году.",
    spouse: ["p9"], parents: ["p1", "p2"]
  }),
  P("p6", {
    name: "Вера Петровна Штейн", maiden: "Ковалёва", sex: "f", gen: 1, birth: { date: "1931-11-19", place: "Тула" }, death: { date: "2016-02-08", place: "Хайфа" },
    occupation: "Библиограф", employer: "Областная библиотека, Тула",
    education: "Московский библиотечный институт, 1954",
    residences: [{ place: "Тула", from: 1931, to: 1955 }, { place: "Ленинград", from: 1955, to: 1991 }, { place: "Хайфа", from: 1991, to: 2016 }],
    photos: [{ caption: "Ленинград, 1958", year: 1958 }, { caption: "Хайфа, 1994", year: 1994 }],
    notes: "Составила первую опись семейного архива в 1987 году — 340 карточек. Опись оцифрована.",
    spouse: ["p10"], parents: ["p1", "p2"]
  }),
  P("p7", {
    name: "Михаил Петрович Ковалёв", sex: "m", gen: 1, birth: { date: "1935-07-07", place: "Тула" }, death: { date: "1994-06-21", place: "Новосибирск" },
    occupation: "Геолог", employer: "Западно-Сибирское геологическое управление",
    education: "Свердловский горный институт, 1959",
    residences: [{ place: "Тула", from: 1935, to: 1954 }, { place: "Свердловск", from: 1954, to: 1959 }, { place: "Новосибирск", from: 1959, to: 1994 }],
    photos: [{ caption: "Экспедиция, Алтай, 1963", year: 1963 }],
    notes: "Полевые дневники 1960–1988 годов хранятся у сына.",
    spouse: ["p11"], parents: ["p1", "p2"]
  }),
  P("p8", {
    name: "Тамара Григорьевна Ковалёва", maiden: "Ланская", sex: "f", gen: 1, birth: { date: "1930-04-25", place: "Смоленск" }, death: { date: "2012-01-14", place: "Москва" },
    occupation: "Врач-терапевт", employer: "Поликлиника №22, Москва",
    education: "1-й Московский медицинский институт, 1955",
    residences: [{ place: "Смоленск", from: 1930, to: 1941 }, { place: "Ташкент", from: 1941, to: 1945, note: "эвакуация" }, { place: "Смоленск", from: 1945, to: 1949 }, { place: "Москва", from: 1949, to: 2012 }],
    photos: [{ caption: "Ташкент, 1944", year: 1944 }, { caption: "Свадьба, 1954", year: 1954 }, { caption: "На приёме, 1970", year: 1970 }],
    notes: "Записала воспоминания об эвакуации в 1998 году. Рукопись 46 страниц, оцифрована.",
    spouse: ["p5"], parents: ["p3", "p4"]
  }),
  P("p9", { name: "Тамара Григорьевна Ковалёва", alias: true, hidden: true, gen: 1, parents: [] }),
  P("p10", {
    name: "Аркадий Львович Штейн", sex: "m", gen: 1, birth: { date: "1929-02-16", place: "Ленинград" }, death: { date: "2003-05-09", place: "Хайфа" },
    occupation: "Скрипач, оркестрант", employer: "Ленинградская филармония",
    education: "Ленинградская консерватория, 1953",
    residences: [{ place: "Ленинград", from: 1929, to: 1991 }, { place: "Хайфа", from: 1991, to: 2003 }],
    photos: [{ caption: "Оркестр, 1961", year: 1961 }],
    spouse: ["p6"], parents: []
  }),
  P("p11", {
    name: "Галина Сергеевна Ковалёва", maiden: "Ерёмина", sex: "f", gen: 1, birth: { date: "1938-09-03", place: "Свердловск" },
    occupation: "Химик-лаборант", employer: "Институт катализа, Новосибирск",
    education: "Уральский политехнический институт, 1961",
    residences: [{ place: "Свердловск", from: 1938, to: 1961 }, { place: "Новосибирск", from: 1961 }],
    living: true, spouse: ["p7"], parents: []
  }),
  P("p12", {
    name: "Борис Григорьевич Ланской", sex: "m", gen: 1, birth: { date: "1937-10-12", place: "Смоленск" }, death: { date: "2009-08-03", place: "Калининград" },
    occupation: "Капитан дальнего плавания", employer: "Балтийское морское пароходство",
    education: "Ленинградское высшее инженерное морское училище, 1960",
    residences: [{ place: "Смоленск", from: 1937, to: 1941 }, { place: "Ташкент", from: 1941, to: 1945 }, { place: "Ленинград", from: 1955, to: 1962 }, { place: "Калининград", from: 1962, to: 2009 }],
    photos: [{ caption: "На мостике, 1974", year: 1974 }, { caption: "Порт Лиссабона, 1981", year: 1981 }],
    notes: "Судовые журналы и открытки из 31 порта. Часть коллекции — в семейном архиве.",
    spouse: ["p13"], parents: ["p3", "p4"]
  }),
  P("p13", {
    name: "Зинаида Фёдоровна Ланская", maiden: "Чуб", sex: "f", gen: 1, birth: { date: "1941-03-08", place: "Воронеж" },
    occupation: "Портниха, ателье", education: "Профтехучилище, Калининград, 1959",
    residences: [{ place: "Воронеж", from: 1941, to: 1958 }, { place: "Калининград", from: 1958 }],
    living: true, spouse: ["p12"], parents: []
  }),

  P("p14", {
    name: "Сергей Николаевич Ковалёв", sex: "m", gen: 2, birth: { date: "1955-01-22", place: "Москва" },
    occupation: "Архитектор", employer: "Проектное бюро «Контур»",
    education: "МАрхИ, 1978",
    residences: [{ place: "Москва", from: 1955, to: 1994 }, { place: "Прага", from: 1994, to: 2006 }, { place: "Москва", from: 2006 }],
    photos: [{ caption: "Диплом МАрхИ, 1978", year: 1978 }, { caption: "Прага, 1997", year: 1997 }],
    notes: "Ведёт семейный архив с 2012 года. Оцифровал 1 200 фотографий.",
    living: true, spouse: ["p15"], parents: ["p5", "p8"]
  }),
  P("p15", {
    name: "Наталья Ивановна Ковалёва", maiden: "Гущина", sex: "f", gen: 2, birth: { date: "1958-06-11", place: "Нижний Новгород" },
    occupation: "Переводчик", education: "Горьковский иняз, 1980",
    residences: [{ place: "Нижний Новгород", from: 1958, to: 1980 }, { place: "Москва", from: 1980, to: 1994 }, { place: "Прага", from: 1994, to: 2006 }, { place: "Москва", from: 2006 }],
    living: true, spouse: ["p14"], parents: []
  }),
  P("p16", {
    name: "Ольга Николаевна Дорн", maiden: "Ковалёва", sex: "f", gen: 2, birth: { date: "1958-09-14", place: "Москва" },
    occupation: "Детский невролог", employer: "Клиника при университете, Мюнхен",
    education: "2-й Московский медицинский институт, 1982",
    residences: [{ place: "Москва", from: 1958, to: 1990 }, { place: "Берлин", from: 1990, to: 1999 }, { place: "Мюнхен", from: 1999 }],
    living: true, spouse: ["p17"], parents: ["p5", "p8"]
  }),
  P("p17", {
    name: "Пауль Дорн", sex: "m", gen: 2, birth: { date: "1956-04-02", place: "Берлин" },
    occupation: "Инженер-акустик", education: "TU Berlin, 1981",
    residences: [{ place: "Берлин", from: 1956, to: 1999 }, { place: "Мюнхен", from: 1999 }],
    living: true, spouse: ["p16"], parents: []
  }),
  P("p18", {
    name: "Ирина Николаевна Ковалёва", sex: "f", gen: 2, birth: { date: "1962-12-01", place: "Москва" },
    occupation: "Редактор", employer: "Издательство «Слово»",
    education: "МГУ, филологический факультет, 1985",
    residences: [{ place: "Москва", from: 1962 }],
    living: true, parents: ["p5", "p8"]
  }),
  P("p19", {
    name: "Лев Аркадьевич Штейн", sex: "m", gen: 2, birth: { date: "1959-03-27", place: "Ленинград" },
    occupation: "Программист", employer: "Elbit, Хайфа",
    education: "ЛЭТИ, 1982",
    residences: [{ place: "Ленинград", from: 1959, to: 1991 }, { place: "Хайфа", from: 1991 }],
    living: true, parents: ["p6", "p10"]
  }),
  P("p20", {
    name: "Марина Аркадьевна Штейн", sex: "f", gen: 2, birth: { date: "1963-07-19", place: "Ленинград" },
    occupation: "Реставратор", employer: "Русский музей",
    education: "Академия художеств, 1988",
    residences: [{ place: "Ленинград", from: 1963 }, { place: "Санкт-Петербург", from: 1991 }],
    living: true, parents: ["p6", "p10"]
  }),
  P("p21", {
    name: "Дмитрий Михайлович Ковалёв", sex: "m", gen: 2, birth: { date: "1966-02-05", place: "Новосибирск" },
    occupation: "Геофизик", employer: "Институт нефтегазовой геологии",
    education: "НГУ, 1989",
    residences: [{ place: "Новосибирск", from: 1966 }],
    living: true, spouse: ["p22"], parents: ["p7", "p11"]
  }),
  P("p22", {
    name: "Елена Ким", sex: "f", gen: 2, birth: { date: "1969-05-30", place: "Алма-Ата" },
    occupation: "Экономист", education: "КазГУ, 1991",
    residences: [{ place: "Алма-Ата", from: 1969, to: 1992 }, { place: "Новосибирск", from: 1992 }],
    living: true, spouse: ["p21"], parents: []
  }),
  P("p23", {
    name: "Виктор Борисович Ланской", sex: "m", gen: 2, birth: { date: "1961-08-08", place: "Калининград" },
    occupation: "Судовой механик", employer: "Балтийский флот, гражданский состав",
    education: "Калининградское мореходное училище, 1983",
    residences: [{ place: "Калининград", from: 1961 }],
    living: true, parents: ["p12", "p13"]
  }),

  P("p24", {
    name: "Алексей Сергеевич Ковалёв", sex: "m", gen: 3, birth: { date: "1982-10-04", place: "Москва" },
    occupation: "Продуктовый дизайнер", employer: "Независимая практика",
    education: "Высшая школа экономики, 2005",
    residences: [{ place: "Москва", from: 1982, to: 1994 }, { place: "Прага", from: 1994, to: 2000 }, { place: "Москва", from: 2000, to: 2019 }, { place: "Тбилиси", from: 2019 }],
    living: true, spouse: ["p25"], parents: ["p14", "p15"],
    notes: "Инициатор оцифровки архива и этого древа."
  }),
  P("p25", {
    name: "Юлия Ковалёва", maiden: "Раева", sex: "f", gen: 3, birth: { date: "1985-01-15", place: "Рига" },
    occupation: "Педиатр", residences: [{ place: "Рига", from: 1985, to: 2007 }, { place: "Москва", from: 2007, to: 2019 }, { place: "Тбилиси", from: 2019 }],
    living: true, spouse: ["p24"], parents: []
  }),
  P("p26", {
    name: "Мария Сергеевна Ковалёва", sex: "f", gen: 3, birth: { date: "1986-03-23", place: "Прага" },
    occupation: "Скрипачка", employer: "Камерный оркестр, Белград",
    education: "Пражская консерватория, 2009",
    residences: [{ place: "Прага", from: 1986, to: 2009 }, { place: "Белград", from: 2009 }],
    living: true, parents: ["p14", "p15"]
  }),
  P("p27", {
    name: "Кирилл Дорн", sex: "m", gen: 3, birth: { date: "1984-11-11", place: "Москва" },
    occupation: "Врач-хирург", employer: "Клиника Мюнхенского университета",
    residences: [{ place: "Москва", from: 1984, to: 1990 }, { place: "Берлин", from: 1990, to: 2003 }, { place: "Мюнхен", from: 2003 }],
    living: true, parents: ["p16", "p17"]
  }),
  P("p28", {
    name: "Антон Дмитриевич Ковалёв", sex: "m", gen: 3, birth: { date: "1992-04-18", place: "Новосибирск" },
    occupation: "Инженер данных", employer: "Yandex", residences: [{ place: "Новосибирск", from: 1992, to: 2014 }, { place: "Торонто", from: 2014 }],
    living: true, parents: ["p21", "p22"]
  }),
  P("p29", { name: "Софья Ковалёва", sex: "f", gen: 4, birth: { date: "2011-07-02", place: "Москва" }, residences: [{ place: "Москва", from: 2011, to: 2019 }, { place: "Тбилиси", from: 2019 }], living: true, minor: true, parents: ["p24", "p25"] }),
  P("p30", { name: "Тимур Ковалёв", sex: "m", gen: 4, birth: { date: "2015-12-19", place: "Москва" }, residences: [{ place: "Москва", from: 2015, to: 2019 }, { place: "Тбилиси", from: 2019 }], living: true, minor: true, parents: ["p24", "p25"] }),
  P("p31", { name: "Лиза Ковалёва", sex: "f", gen: 4, birth: { date: "2014-05-06", place: "Белград" }, residences: [{ place: "Белград", from: 2014 }], living: true, minor: true, parents: ["p26"] })
].filter(p => !p.hidden);

// p5 женат на p8 — поправляем ссылку (p9 был техническим дублем)
PEOPLE.find(p => p.id === "p5").spouse = ["p8"];

export const MODERATION = [
  {
    id: "m1", author: "Марина Штейн", role: "родственник", date: "2026-08-11T09:12:00", target: "p6", targetName: "Вера Петровна Штейн",
    kind: "edit", summary: "Уточнены даты жизни и место работы",
    changes: [
      { field: "Дата смерти", before: "1996-02-08", after: "2016-02-08" },
      { field: "Место работы", before: "Библиотека", after: "Областная библиотека, Тула" },
      { field: "Заметки", before: "—", after: "Составила первую опись семейного архива в 1987 году — 340 карточек." }
    ]
  },
  {
    id: "m2", author: "Антон Ковалёв", role: "родственник", date: "2026-08-10T20:41:00", target: "p7", targetName: "Михаил Петрович Ковалёв",
    kind: "photo", summary: "Добавлено 3 фотографии в галерею",
    changes: [
      { field: "Галерея", before: "1 фото", after: "4 фото" },
      { field: "Подпись", before: "—", after: "Экспедиция на Алтае, 1963. Слева — М. П. Ковалёв" }
    ]
  },
  {
    id: "m3", author: "Кирилл Дорн", role: "родственник", date: "2026-08-09T14:05:00", target: null, targetName: "Ханна Дорн (новый человек)",
    kind: "new", summary: "Новый человек: мать Пауля Дорна",
    changes: [
      { field: "ФИО", before: "—", after: "Ханна Дорн (Вебер)" },
      { field: "Годы жизни", before: "—", after: "1928–2011" },
      { field: "Родство", before: "—", after: "Мать Пауля Дорна" },
      { field: "Места проживания", before: "—", after: "Берлин (1928–2011)" }
    ]
  },
  {
    id: "m4", author: "Виктор Ланской", role: "родственник", date: "2026-08-08T11:30:00", target: "p3", targetName: "Григорий Иванович Ланской",
    kind: "edit", summary: "Исправлено место гибели по данным ОБД «Мемориал»",
    changes: [
      { field: "Место смерти", before: "Смоленск", after: "Ржев" },
      { field: "Источники", before: "—", after: "ОБД «Мемориал», запись 51203877" }
    ]
  }
];

export const byId = (people) => Object.fromEntries(people.map(p => [p.id, p]));

export const years = (p) => {
  const b = p.birth?.date?.slice(0, 4) || "?";
  if (p.living) return `род. ${b}`;
  return `${b} — ${p.death?.date?.slice(0, 4) || "?"}`;
};

export const initials = (p) => (p.name || "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("");

export const shortName = (p) => {
  const parts = (p.name || "").split(" ");
  return parts.length >= 3 ? `${parts[parts.length - 1]} ${parts[0][0]}. ${parts[1][0]}.` : p.name;
};

// ——— Раскладка: поколения сверху вниз, супруги парой, дети центрированы под родителями
export function layout(people, opts = {}) {
  const W = opts.w || 190, H = opts.h || 96, GX = opts.gx || 26, GY = opts.gy || 92;
  const idx = byId(people);
  const kidsOf = (a, b) => people.filter(p => p.parents?.length && p.parents.includes(a) && (!b || p.parents.includes(b)));
  const placed = new Set();
  const nodes = [];
  const unions = [];
  const rowRight = {};
  const GAP = GX * 2;

  const bump = (n) => { rowRight[n.depth] = Math.max(rowRight[n.depth] ?? -Infinity, n.x + n.w); };
  const shift = (from, d) => { for (let i = from; i < nodes.length; i++) { nodes[i].x += d; bump(nodes[i]); } };

  function block(p, depth) {
    if (placed.has(p.id)) return null;
    placed.add(p.id);
    const sp = (p.spouse || []).map(id => idx[id]).find(s => s && !placed.has(s.id));
    if (sp) placed.add(sp.id);
    const members = sp ? [p, sp] : [p];
    const kids = kidsOf(p.id, sp?.id).concat(sp ? [] : kidsOf(p.id, null)).filter((v, i, a) => a.indexOf(v) === i);
    const blockW = members.length * W + (members.length - 1) * GX;

    const startIdx = nodes.length;
    const centers = [];
    kids.forEach(k => { const b = block(k, depth + 1); if (b) centers.push(b.center); });

    let x0 = centers.length
      ? (Math.min(...centers) + Math.max(...centers)) / 2 - blockW / 2
      : (rowRight[depth] ?? -GAP) + GAP;
    const minX = (rowRight[depth] ?? -GAP) + GAP;
    if (x0 < minX) { shift(startIdx, minX - x0); x0 = minX; }

    const y = depth * (H + GY);
    members.forEach((m, i) => { const n = { id: m.id, p: m, x: x0 + i * (W + GX), y, w: W, h: H, depth, unionIdx: i }; nodes.push(n); bump(n); });
    const rec = { center: x0 + blockW / 2, depth, members: members.map(m => m.id), kids: kids.map(k => k.id), spouse: !!sp };
    unions.push(rec);
    return rec;
  }

  people.filter(p => !p.parents?.length).forEach(p => { if (!placed.has(p.id)) block(p, 0); });
  people.forEach(p => { if (!placed.has(p.id)) block(p, p.gen || 0); });

  const pos = Object.fromEntries(nodes.map(n => [n.id, n]));
  const edges = [];
  unions.forEach(u => {
    const first = pos[u.members[0]];
    if (!first) return;
    if (u.spouse) {
      const [a, b] = u.members.map(id => pos[id]);
      if (a && b) edges.push({ type: "h", x: a.x + a.w, y: a.y + a.h / 2, len: b.x - (a.x + a.w) });
    }
    if (u.kids.length) {
      const second = pos[u.members[1]];
      const anchorX = u.spouse && second ? (first.x + first.w + (second.x - first.x - first.w) / 2) : (first.x + W / 2);
      const top = first.y + H, bus = top + GY / 2;
      edges.push({ type: "v", x: anchorX, y: top, len: bus - top });
      const kx = u.kids.map(id => pos[id]).filter(Boolean).map(n => n.x + n.w / 2);
      if (kx.length) {
        const x1 = Math.min(anchorX, ...kx), x2 = Math.max(anchorX, ...kx);
        edges.push({ type: "h", x: x1, y: bus, len: x2 - x1 });
        u.kids.forEach(id => { const n = pos[id]; if (n) edges.push({ type: "v", x: n.x + n.w / 2, y: bus, len: n.y - bus }); });
      }
    }
  });

  const width = Math.max(...nodes.map(n => n.x + n.w), 100);
  const height = Math.max(...nodes.map(n => n.y + n.h), 100);
  return { nodes, edges, width, height, unions };
}

// Горизонтальная раскладка = транспонированная вертикальная
export function layoutH(people, opts = {}) {
  const r = layout(people, Object.assign({ w: 108, h: 176, gx: 22, gy: 120 }, opts));
  const nodes = r.nodes.map(n => ({ ...n, x: n.y, y: n.x, w: n.h, h: n.w }));
  const edges = r.edges.map(e => e.type === "h"
    ? { type: "v", x: e.y, y: e.x, len: e.len }
    : { type: "h", x: e.y, y: e.x, len: e.len });
  return { nodes, edges, width: r.height, height: r.width, unions: r.unions };
}

// ——— Веер предков: кольца по поколениям вокруг фокусной персоны
export function fan(people, focusId, opts = {}) {
  const idx = byId(people);
  const R0 = opts.r0 || 86, RW = opts.rw || 96, SPAN = opts.span || 300, START = opts.start || -150;
  const MAXD = opts.depth || 3;
  const segs = [];
  function walk(p, depth, a0, a1) {
    if (depth > MAXD) return;
    segs.push({ id: p ? p.id : null, p, ghost: !p, depth, a0, a1, r0: depth === 0 ? 0 : R0 + (depth - 1) * RW, r1: depth === 0 ? R0 : R0 + depth * RW, mid: (a0 + a1) / 2 });
    if (depth === MAXD) return;
    const par = p ? (p.parents || []).map(i => idx[i]).filter(Boolean) : [];
    const father = par.find(x => x.sex === "m") || par[0] || null;
    const mother = par.find(x => x.sex === "f" && x !== father) || null;
    const half = (a1 - a0) / 2;
    walk(father, depth + 1, a0, a0 + half);
    walk(mother, depth + 1, a0 + half, a1);
  }
  walk(idx[focusId], 0, START, START + SPAN);
  const polar = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [Math.cos(a) * r, Math.sin(a) * r]; };
  segs.forEach(s => {
    if (s.depth === 0) { s.d = null; return; }
    const [x0, y0] = polar(s.r0, s.a0), [x1, y1] = polar(s.r1, s.a0);
    const [x2, y2] = polar(s.r1, s.a1), [x3, y3] = polar(s.r0, s.a1);
    const large = (s.a1 - s.a0) > 180 ? 1 : 0;
    s.d = `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}A${s.r1} ${s.r1} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}L${x3.toFixed(1)} ${y3.toFixed(1)}A${s.r0} ${s.r0} 0 ${large} 0 ${x0.toFixed(1)} ${y0.toFixed(1)}Z`;
    const [lx, ly] = polar((s.r0 + s.r1) / 2, s.mid);
    s.lx = lx; s.ly = ly;
    let rot = s.mid; if (rot > 90 || rot < -90) rot += 180;
    s.rot = rot;
  });
  return segs;
}

// ——— Потомки фокусной персоны (для варианта «Веер»: нижние кольца)
export function descendants(people, rootId) {
  const kids = (id) => people.filter(p => (p.parents || []).includes(id));
  const out = []; const walk = (id, d) => { kids(id).forEach(k => { out.push({ p: k, depth: d }); walk(k.id, d + 1); }); };
  walk(rootId, 1); return out;
}

// ——— Точки на карте
export function mapPoints(people, { hideLiving = false } = {}) {
  const pts = [];
  people.forEach(p => {
    if (hideLiving && p.living) return;
    (p.residences || []).forEach((r, i) => {
      const c = PLACES[r.place];
      if (!c) return;
      pts.push({ person: p, place: r.place, lat: c[0], lon: c[1], from: r.from, to: r.to || (p.living ? 2026 : Number(p.death?.date?.slice(0, 4)) || r.from), note: r.note, order: i, gen: p.gen });
    });
  });
  return pts;
}

// ——— Импорт
export function parseGedcom(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const recs = []; let cur = null, ctx = null;
  for (const line of lines) {
    const m = line.match(/^(\d+)\s+(@[^@]+@\s+)?(\w+)\s*(.*)$/);
    if (!m) continue;
    const [, lvl, ptr, tag, val] = m;
    if (lvl === "0") { cur = { id: ptr ? ptr.trim().replace(/@/g, "") : null, tag, name: "", events: {} }; recs.push(cur); ctx = null; continue; }
    if (!cur) continue;
    if (lvl === "1") { ctx = tag; if (tag === "FILE" || tag === "_TITL" || tag === "TITL") cur.title = val.trim(); if (tag === "NAME") cur.name = val.replace(/\//g, "").trim(); if (tag === "SEX") cur.sex = val.toLowerCase(); if (tag === "FAMS" || tag === "FAMC") (cur[tag] = cur[tag] || []).push(val.replace(/@/g, "")); if (tag === "HUSB" || tag === "WIFE") cur[tag] = val.replace(/@/g, ""); if (tag === "CHIL") (cur.CHIL = cur.CHIL || []).push(val.replace(/@/g, "")); cur.events[tag] = cur.events[tag] || {}; }
    if (lvl === "2" && ctx) { cur.events[ctx] = cur.events[ctx] || {}; cur.events[ctx][tag] = val; }
  }
  const fams = recs.filter(r => r.tag === "FAM");
  const people = recs.filter(r => r.tag === "INDI").map(r => {
    const parents = [];
    (r.FAMC || []).forEach(fid => { const f = fams.find(x => x.id === fid); if (f) { if (f.HUSB) parents.push(f.HUSB); if (f.WIFE) parents.push(f.WIFE); } });
    const spouse = [];
    (r.FAMS || []).forEach(fid => { const f = fams.find(x => x.id === fid); if (f) { [f.HUSB, f.WIFE].forEach(s => { if (s && s !== r.id) spouse.push(s); }); } });
    return P(r.id, {
      name: r.name, sex: r.sex, parents, spouse,
      birth: r.events.BIRT ? { date: r.events.BIRT.DATE, place: r.events.BIRT.PLAC } : undefined,
      death: r.events.DEAT ? { date: r.events.DEAT.DATE, place: r.events.DEAT.PLAC } : undefined,
      residences: r.events.RESI?.PLAC ? [{ place: r.events.RESI.PLAC }] : []
    });
  });
  const head = recs.find(r => r.tag === "HEAD");
  const title = (head && (head.events?.FILE?.__val || head.title)) || "";
  return { people, families: fams.length, title };
}

export function parseJson(text) {
  const d = JSON.parse(text);
  const people = Array.isArray(d) ? d : (d.people || []);
  return { people, families: 0, title: d.title || "", subtitle: d.subtitle || "" };
}

export function exportBackup(people, moderation, meta = {}) {
  return JSON.stringify({
    format: "family-tree-backup", version: 1, exported: new Date().toISOString(),
    title: meta.title || "", subtitle: meta.subtitle || "",
    counts: { people: people.length, pending: moderation.length },
    people, moderation
  }, null, 2);
}

export function download(name, text, type = "application/json") {
  const b = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
