type Dict = Record<string, string>;

// English is the default and the fallback; a language is only auto-selected if
// we actually ship it.
const EN: Dict = {
  solo: 'Single player',
  online: 'Play with friends',
  create: 'Create a room',
  join: 'Join with a code',
  code: 'Room code',
  players: 'Players',
  bots: 'Fill with bots',
  difficulty: 'Difficulty',
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  start: 'Start',
  waiting: 'Waiting for players',
  you: 'You',
  bot: 'Bot',
  won: 'You won',
  lost: 'You lost',
  draw: 'Draw',
  again: 'Play again',
  menu: 'Menu',
  back: 'Back',
  copied: 'Code copied',
  hintLink: 'Drag from your nest to another node',
  hintChew: 'Hold an enemy trail to gnaw through it',
  hintSupply: 'A node cut off from home stops growing',
  cutOff: 'cut off',
  offline: 'Server unreachable — single player still works',
  connecting: 'Connecting',
  roomFull: 'Room is full',
  noRoom: 'No such room',
  left: 'left the game',
  sound: 'Sound',
  language: 'Language',
  hintAir: 'Wasps ignore trails — take the hive itself',
  hintOwn: 'Tap your own trail to remove it',
  hintRange: 'Too far for a trail — go through a closer node',
  hintBusy: 'You are gnawing — let go first',
  legendNest: 'Nest · workers',
  legendDen: 'Beetle den · breaks through',
  legendHive: 'Wasp hive · flies anywhere',
  legend: 'What is what',
};

const UK: Dict = {
  solo: 'Одиночна гра',
  online: 'Грати з друзями',
  create: 'Створити кімнату',
  join: 'Увійти за кодом',
  code: 'Код кімнати',
  players: 'Гравців',
  bots: 'Добрати ботами',
  difficulty: 'Складність',
  easy: 'Легко',
  normal: 'Звично',
  hard: 'Важко',
  start: 'Почати',
  waiting: 'Чекаємо на гравців',
  you: 'Ти',
  bot: 'Бот',
  won: 'Перемога',
  lost: 'Поразка',
  draw: 'Нічия',
  again: 'Ще раз',
  menu: 'Меню',
  back: 'Назад',
  copied: 'Код скопійовано',
  hintLink: 'Проведи від свого мурашника до іншого вузла',
  hintChew: 'Тримай палець на чужій стежці, щоб її прогризти',
  hintSupply: 'Вузол, відрізаний від домівки, перестає рости',
  cutOff: 'без постачання',
  offline: 'Сервер недоступний — одиночна гра працює',
  connecting: 'З’єднання',
  roomFull: 'Кімната заповнена',
  noRoom: 'Такої кімнати немає',
  left: 'вийшов з гри',
  sound: 'Звук',
  language: 'Мова',
  hintAir: 'Оси стежками не ходять — захопи саме гніздо',
  hintOwn: 'Тицьни на свою стежку, щоб її прибрати',
  hintRange: 'Задалеко для стежки — йди через ближчий вузол',
  hintBusy: 'Ти гризеш — спершу відпусти',
  legendNest: 'Мурашник · робочі',
  legendDen: 'Загін жуків · пробиває',
  legendHive: 'Осине гніздо · летить будь-куди',
  legend: 'Що є що',
};

const PL: Dict = {
  solo: 'Gra jednoosobowa', online: 'Graj ze znajomymi', create: 'Utwórz pokój',
  join: 'Dołącz kodem', code: 'Kod pokoju', players: 'Gracze', bots: 'Uzupełnij botami',
  difficulty: 'Poziom', easy: 'Łatwy', normal: 'Normalny', hard: 'Trudny', start: 'Start',
  waiting: 'Czekamy na graczy', you: 'Ty', bot: 'Bot', won: 'Zwycięstwo', lost: 'Porażka',
  draw: 'Remis', again: 'Jeszcze raz', menu: 'Menu', back: 'Wstecz', copied: 'Skopiowano kod',
  hintLink: 'Przeciągnij od swojego mrowiska do innego węzła',
  hintChew: 'Przytrzymaj wrogi szlak, aby go przegryźć',
  hintSupply: 'Węzeł odcięty od domu przestaje rosnąć', cutOff: 'bez zaopatrzenia',
  offline: 'Serwer niedostępny — gra jednoosobowa działa', connecting: 'Łączenie',
  roomFull: 'Pokój pełny', noRoom: 'Nie ma takiego pokoju', left: 'opuścił grę',
  sound: 'Dźwięk', language: 'Język',
  hintAir: 'Osy nie chodzą szlakami — zdobądź samo gniazdo',
  hintOwn: 'Dotknij swojego szlaku, aby go usunąć',
  hintRange: 'Za daleko na szlak — idź przez bliższy węzeł',
  hintBusy: 'Przegryzasz — najpierw puść',
  legendNest: 'Mrowisko · robotnice',
  legendDen: 'Legowisko żuków · przebija',
  legendHive: 'Gniazdo os · lata wszędzie',
  legend: 'Co jest czym',
};

const DE: Dict = {
  solo: 'Einzelspieler', online: 'Mit Freunden spielen', create: 'Raum erstellen',
  join: 'Mit Code beitreten', code: 'Raumcode', players: 'Spieler', bots: 'Mit Bots auffüllen',
  difficulty: 'Schwierigkeit', easy: 'Leicht', normal: 'Normal', hard: 'Schwer', start: 'Start',
  waiting: 'Warte auf Spieler', you: 'Du', bot: 'Bot', won: 'Gewonnen', lost: 'Verloren',
  draw: 'Unentschieden', again: 'Nochmal', menu: 'Menü', back: 'Zurück', copied: 'Code kopiert',
  hintLink: 'Ziehe von deinem Nest zu einem anderen Knoten',
  hintChew: 'Halte einen feindlichen Pfad, um ihn durchzubeißen',
  hintSupply: 'Ein abgeschnittener Knoten wächst nicht mehr', cutOff: 'ohne Nachschub',
  offline: 'Server nicht erreichbar — Einzelspieler läuft', connecting: 'Verbinde',
  roomFull: 'Raum ist voll', noRoom: 'Raum nicht gefunden', left: 'hat das Spiel verlassen',
  sound: 'Ton', language: 'Sprache',
  hintAir: 'Wespen nutzen keine Pfade — nimm das Nest selbst',
  hintOwn: 'Tippe deinen Pfad an, um ihn zu entfernen',
  hintRange: 'Zu weit für einen Pfad — geh über einen näheren Knoten',
  hintBusy: 'Du beißt gerade — lass erst los',
  legendNest: 'Nest · Arbeiterinnen',
  legendDen: 'Käferbau · bricht durch',
  legendHive: 'Wespennest · fliegt überall hin',
  legend: 'Was ist was',
};

const ES: Dict = {
  solo: 'Un jugador', online: 'Jugar con amigos', create: 'Crear sala',
  join: 'Entrar con código', code: 'Código de sala', players: 'Jugadores', bots: 'Rellenar con bots',
  difficulty: 'Dificultad', easy: 'Fácil', normal: 'Normal', hard: 'Difícil', start: 'Empezar',
  waiting: 'Esperando jugadores', you: 'Tú', bot: 'Bot', won: 'Victoria', lost: 'Derrota',
  draw: 'Empate', again: 'Otra vez', menu: 'Menú', back: 'Atrás', copied: 'Código copiado',
  hintLink: 'Arrastra desde tu hormiguero a otro nodo',
  hintChew: 'Mantén pulsado un sendero enemigo para roerlo',
  hintSupply: 'Un nodo aislado deja de crecer', cutOff: 'sin suministro',
  offline: 'Servidor no disponible — un jugador funciona', connecting: 'Conectando',
  roomFull: 'Sala llena', noRoom: 'No existe esa sala', left: 'salió de la partida',
  sound: 'Sonido', language: 'Idioma',
  hintAir: 'Las avispas no usan senderos — toma el avispero',
  hintOwn: 'Toca tu sendero para quitarlo',
  hintRange: 'Demasiado lejos — pasa por un nodo más cercano',
  hintBusy: 'Estás royendo — suelta primero',
  legendNest: 'Hormiguero · obreras',
  legendDen: 'Guarida · atraviesa',
  legendHive: 'Avispero · vuela a todas partes',
  legend: 'Qué es qué',
};

const PT: Dict = {
  solo: 'Um jogador', online: 'Jogar com amigos', create: 'Criar sala',
  join: 'Entrar com código', code: 'Código da sala', players: 'Jogadores', bots: 'Preencher com bots',
  difficulty: 'Dificuldade', easy: 'Fácil', normal: 'Normal', hard: 'Difícil', start: 'Começar',
  waiting: 'À espera de jogadores', you: 'Tu', bot: 'Bot', won: 'Vitória', lost: 'Derrota',
  draw: 'Empate', again: 'Outra vez', menu: 'Menu', back: 'Voltar', copied: 'Código copiado',
  hintLink: 'Arrasta do teu formigueiro para outro nó',
  hintChew: 'Mantém premido um trilho inimigo para o roer',
  hintSupply: 'Um nó isolado deixa de crescer', cutOff: 'sem abastecimento',
  offline: 'Servidor indisponível — um jogador funciona', connecting: 'A ligar',
  roomFull: 'Sala cheia', noRoom: 'Sala não encontrada', left: 'saiu do jogo',
  sound: 'Som', language: 'Idioma',
  hintAir: 'As vespas não usam trilhos — toma o próprio ninho',
  hintOwn: 'Toca no teu trilho para o remover',
  hintRange: 'Longe demais — passa por um nó mais próximo',
  hintBusy: 'Estás a roer — larga primeiro',
  legendNest: 'Formigueiro · operárias',
  legendDen: 'Covil · atravessa',
  legendHive: 'Ninho de vespas · voa para todo o lado',
  legend: 'O que é o quê',
};

export const LANGS: Record<string, { name: string; dict: Dict }> = {
  en: { name: 'English', dict: EN },
  uk: { name: 'Українська', dict: UK },
  pl: { name: 'Polski', dict: PL },
  de: { name: 'Deutsch', dict: DE },
  es: { name: 'Español', dict: ES },
  pt: { name: 'Português', dict: PT },
};

let current = 'en';

export function detectLang(): string {
  try {
    const saved = localStorage.getItem('ants.lang');
    if (saved && LANGS[saved]) return saved;
  } catch {
    // Private mode throws on access; falling through to detection is correct.
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = (tag || '').slice(0, 2).toLowerCase();
    if (LANGS[code]) return code;
  }

  return 'en';
}

export function setLang(code: string): void {
  if (!LANGS[code]) return;
  current = code;
  document.documentElement.lang = code;
  try {
    localStorage.setItem('ants.lang', code);
  } catch {
    // Nothing to do: the choice simply will not survive a reload.
  }
}

export function lang(): string {
  return current;
}

export function t(key: keyof typeof EN | string): string {
  return LANGS[current]?.dict[key] ?? EN[key] ?? key;
}
