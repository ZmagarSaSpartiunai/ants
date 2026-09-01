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
  hintBusy: 'You are gnawing — let go first',
  legendNest: 'Nest · workers · 3 trails',
  legendDen: 'Beetle den · breaks through · 2',
  legendHive: 'Wasp hive · flies anywhere · 1',
  legend: 'What is what',
  nodesLabel: 'Nodes',
  antsLabel: 'Ants',
  hintNodeFull: 'This node already runs all its trails',
  hintBlocked: 'A node is in the way — chain the trail through it',
  openSeat: 'Open seat',
  allSeated: 'Everyone is seated — start when ready',
  shareCode: 'Read the code out to a friend, or tap to copy',
  fullscreen: 'Fullscreen',
  hintSevered: 'The ground here is torn up — wait for it to settle',
};

const UK: Dict = {
  solo: 'Одиночна гра',
  online: 'Грати з друзями',
  create: 'Створити кімнату',
  join: 'Увійти за кодом',
  code: 'Код кімнати',
  players: 'Гравців',
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
  hintBusy: 'Ти гризеш — спершу відпусти',
  legendNest: 'Мурашник · робочі · 3 стежки',
  legendDen: 'Загін жуків · пробиває · 2',
  legendHive: 'Осине гніздо · летить будь-куди · 1',
  legend: 'Що є що',
  nodesLabel: 'Вузли',
  antsLabel: 'Мурахи',
  hintNodeFull: 'Цей вузол уже веде всі свої стежки',
  hintBlocked: 'На шляху вузол — веди стежку через нього',
  openSeat: 'Вільне місце',
  allSeated: 'Усі на місцях — можна починати',
  shareCode: 'Продиктуй код другові або тицьни, щоб скопіювати',
  fullscreen: 'На весь екран',
  hintSevered: 'Тут земля розрита — зачекай, поки осяде',
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
  hintBusy: 'Przegryzasz — najpierw puść',
  legendNest: 'Mrowisko · robotnice · 3 szlaki',
  legendDen: 'Legowisko żuków · przebija · 2',
  legendHive: 'Gniazdo os · lata wszędzie · 1',
  legend: 'Co jest czym',
  nodesLabel: 'Węzły',
  antsLabel: 'Mrówki',
  hintNodeFull: 'Ten węzeł prowadzi już wszystkie szlaki',
  hintBlocked: 'Na drodze jest węzeł — poprowadź szlak przez niego',
  openSeat: 'Wolne miejsce',
  allSeated: 'Wszyscy na miejscach — można zaczynać',
  shareCode: 'Podyktuj kod znajomemu lub dotknij, aby skopiować',
  fullscreen: 'Pełny ekran',
  hintSevered: 'Ziemia tu jest rozryta — poczekaj, aż osiądzie',
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
  hintBusy: 'Du beißt gerade — lass erst los',
  legendNest: 'Nest · Arbeiterinnen · 3 Pfade',
  legendDen: 'Käferbau · bricht durch · 2',
  legendHive: 'Wespennest · fliegt überall hin · 1',
  legend: 'Was ist was',
  nodesLabel: 'Knoten',
  antsLabel: 'Ameisen',
  hintNodeFull: 'Dieser Knoten führt schon alle seine Pfade',
  hintBlocked: 'Ein Knoten ist im Weg — führe den Pfad durch ihn',
  openSeat: 'Freier Platz',
  allSeated: 'Alle sitzen — es kann losgehen',
  shareCode: 'Sag den Code einem Freund oder tippe zum Kopieren',
  fullscreen: 'Vollbild',
  hintSevered: 'Der Boden ist hier aufgerissen — warte, bis er sich setzt',
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
  hintBusy: 'Estás royendo — suelta primero',
  legendNest: 'Hormiguero · obreras · 3 senderos',
  legendDen: 'Guarida · atraviesa · 2',
  legendHive: 'Avispero · vuela a todas partes · 1',
  legend: 'Qué es qué',
  nodesLabel: 'Nodos',
  antsLabel: 'Hormigas',
  hintNodeFull: 'Este nodo ya lleva todos sus senderos',
  hintBlocked: 'Hay un nodo en medio — encadena el sendero por él',
  openSeat: 'Asiento libre',
  allSeated: 'Todos sentados — se puede empezar',
  shareCode: 'Dicta el código a un amigo o toca para copiar',
  fullscreen: 'Pantalla completa',
  hintSevered: 'Aquí la tierra está removida — espera a que se asiente',
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
  hintBusy: 'Estás a roer — larga primeiro',
  legendNest: 'Formigueiro · operárias · 3 trilhos',
  legendDen: 'Covil · atravessa · 2',
  legendHive: 'Ninho de vespas · voa para todo o lado · 1',
  legend: 'O que é o quê',
  nodesLabel: 'Nós',
  antsLabel: 'Formigas',
  hintNodeFull: 'Este nó já leva todos os seus trilhos',
  hintBlocked: 'Há um nó no caminho — encadeia o trilho por ele',
  openSeat: 'Lugar livre',
  allSeated: 'Todos sentados — podem começar',
  shareCode: 'Dita o código a um amigo ou toca para copiar',
  fullscreen: 'Ecrã inteiro',
  hintSevered: 'Aqui a terra está revolvida — espera que assente',
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
