# Второе мнение: проверка другой моделью

Вся ветка задачи проверена второй моделью, Codex, против основной ветки тестового сайта. Модель работала по подписке, без платных запусков.

## Итог

- Блокирующих замечаний нет. Два замечания средней важности, оба подтвердились и исправлены.
- Ни одно из двух не было найдено при код-ревью. Совпадений с ним нет.
- Решений руководителя не требуется. Объём и поведение для обычных турниров не менялись.

## Что проверяли

- Ветка задачи против основной ветки тестового сайта: 115 файлов, около 15 200 добавленных строк.
- Вошли сервер, база и образцы, все страницы, стили, тесты, документы и исправления код-ревью.
- Модель сама читала изменения и файлы рабочей копии, только на чтение.

## Ответ модели полностью

```
A stalled response body can leave scoring blocked indefinitely. Accepted tournament dates can also produce matches the tournament page cannot display.

Full review comments:

- [P2] Keep request timeout active through response parsing — /srv/projects/tennis/worktrees/task-work-3/src/api.ts:48-53
  When response headers arrive but the JSON body stalls, this clears the timeout before `res.json()` finishes. The judge screen stays in `sending`, blocking every scoring button. Keep the timer active through body parsing and report an aborted read as a network failure.

- [P2] Reject or display tournaments longer than 400 days — /srv/projects/tennis/worktrees/task-work-3/server/time.ts:37-37
  For a tournament spanning more than 400 days, this silently omits later days. `TournamentView` selects only `data.days`, making later scheduled matches unreachable despite `saveTournament` accepting them. Generate all days or reject overlong tournaments when saving.
```

Итог проверки модели: пройдена, только замечания средней важности. Расход токенов модель не сообщила.

## Замечания и решения

1. Экран судьи мог зависнуть на «Отправляем».
   - Суть: ожидание ответа сервера ограничено 10 секундами, но только до заголовков. Если связь обрывалась посреди ответа, страница ждала без конца. Пока очко не сохранено, следующее отметить нельзя (S9.9), и судья оставался без кнопок до перезагрузки.
   - Проверено: тестовый сервер отдаёт заголовки и замолкает. Прежний код ждал, пока его не остановили через 15 секунд.
   - Исправлено: ограничение действует до конца ответа. Оборванный ответ считается «нет связи», и судья видит кнопку повторной отправки. Тот же сервер теперь получает отказ через 0,3 секунды при пределе 0,3 секунды. Обычный ответ, ошибка сервера и страница ошибки прокси разбираются как раньше.
   - Касается всех страниц: онлайн-счёт тоже больше не ждёт зависший ответ, а переходит к следующему опросу.
2. Матчи турнира длиннее 400 дней не были видны.
   - Суть: страница турнира показывает не больше 400 дней, а сохранение турнира принимало любые даты. Матчи после 400-го дня нельзя было открыть со страницы турнира.
   - Исправлено: турнир длиннее 400 дней не сохраняется. У поля даты окончания появляется «Турнир не длиннее 400 дней». Настоящие турниры длятся дни, предел их не касается.
   - Добавлен тест: 400 дней сохраняются, 401 — нет.

## Проверки

- `codex review --base staging -c 'sandbox_mode="read-only"' -c 'model_reasoning_effort="high"' -c 'web_search="cached"'` (вход по подписке, модель только на чтение): exit 0.
- Проверка зависшего ответа, прежний код, на тестовом сервере: `timeout 15 node_modules/.bin/tsx tmp/so/stall-old.mts`: exit 124, ответ не пришёл.
- Та же проверка, новый код: `timeout 60 node_modules/.bin/tsx tmp/so/stall.mts`: exit 0, PASS.
- `bun run test server/admin.test.ts server/dates.test.ts server/rating.test.ts server/files.test.ts server/seed.test.ts`: 5 наборов, 56 тестов, exit 0.
- `node_modules/.bin/tsc --noEmit -p .`: exit 0.
- `bun run build`: exit 0.
- Браузер на сайте разработки: `node tmp/pw/review.mjs`, 11 PASS, exit 0; `node tmp/pw/check.mjs`, exit 0, без FAIL. Очко судьи появилось на онлайн-счёте через 8,7 секунды, ошибок в браузере нет.
- Весь набор тестов не запускался: он идёт один раз при выпуске.

## Оставшиеся риски

- Все риски из код-ревью остаются в силе, вторая модель их не сняла и не добавила новых.
- Пустой успешный ответ сервера по-прежнему не считается обрывом связи. Сервер так не отвечает, экран судьи такой случай показывает как «не отправлено».
- Проверка зависшего ответа не входит в автотесты: страницы проверяются браузером, так решено в плане.
