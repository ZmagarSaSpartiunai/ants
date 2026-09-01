# Розгортання

Сервер віддає і клієнт, і WebSocket з одного процесу на `127.0.0.1:8787`.
Назовні він виходить лише через тунель Cloudflare — порт нікуди не
відкривається, UFW чіпати не треба.

## Чому не через панельний Caddy

На машині вже крутиться Caddy для панелі, але його сайт оголошений як
`:8080` — тобто **відповідає на будь-який Host**. Другий піддомен, наведений
на той самий порт, віддав би панель замість гри. Тому гра слухає власний
порт, а тунель веде на нього напряму. Панелі це не торкається взагалі.

## Перший раз

```bash
# Node без sudo — офіційний архів у домашню теку
curl -fsSL https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-x64.tar.xz \
  | tar -xJ -C ~/.local && mv ~/.local/node-v20.18.1-linux-x64 ~/.local/node

git clone git@github.com:ZmagarSaSpartiunai/ants.git ~/projects/ants
cd ~/projects/ants && ~/.local/node/bin/npm ci && ~/.local/node/bin/npm run build

cp deploy/systemd/ants.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now ants
```

Перевірка: `curl -s localhost:8787/health`.

## Публічний піддомен

У `~/.cloudflared/config.yml` додати **перед** фолбеком `http_status:404`:

```yaml
  - hostname: ants.bialian.trade
    service: http://127.0.0.1:8787
```

Далі запис DNS і перезапуск:

```bash
~/.local/bin/cloudflared tunnel route dns command-post ants.bialian.trade
systemctl --user restart cloudflared
```

⚠️ Перезапуск тунелю на кілька секунд обриває і панель — вона ходить тим
самим тунелем.

⚠️ На цей піддомен **не вішати Cloudflare Access**. Панель за Access, і це
правильно; гра має відкриватись без входу, інакше в неї не зайде жоден друг.

## Пароль на час розробки

Задай `ANTS_PASSWORD` у `~/projects/ants/.env` — і сторінка, і WebSocket
питатимуть пароль. Куку підписано HMAC від пароля, тож вона переживає
перезапуск і не видає самого пароля. Після восьми невдалих спроб з адреси —
відсічка на хвилину.

`/health` лишається відкритим навмисне: інакше ним не можна наглядати.

Капчі тут немає свідомо: будь-яка справжня — це сторонній скрипт, а проєкт їх
не вантажить. Якщо треба сильніше, піддомен і так за Cloudflare, і виклик
можна ввімкнути в панелі Cloudflare без жодного коду.

Прибрати пароль: прибрати рядок з `.env` і `systemctl --user restart ants`.

## Оновлення

```bash
cd ~/projects/ants && git pull && ~/.local/node/bin/npm ci \
  && ~/.local/node/bin/npm run build && systemctl --user restart ants
```

## База даних

Гра працює і без бази — тоді просто не пишеться історія матчів. Живий матч
у базу не ходить ніколи, туди йде один рядок на завершений матч.

PostgreSQL потребує sudo, тому ставиться вручну:

```bash
sudo apt install -y postgresql
sudo -u postgres psql -c "CREATE USER ants WITH PASSWORD 'ПАРОЛЬ';"
sudo -u postgres psql -c "CREATE DATABASE ants OWNER ants;"
psql "postgres://ants:ПАРОЛЬ@127.0.0.1:5432/ants" -f db/migrations/001_init.sql
psql "postgres://ants:ПАРОЛЬ@127.0.0.1:5432/ants" -f db/migrations/002_stats.sql
```

Потім прописати `DATABASE_URL` у `~/projects/ants/.env` і
`systemctl --user restart ants`.

Postgres слухає `127.0.0.1` за замовчуванням — так і лишити.
