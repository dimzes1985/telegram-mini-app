# Slot Android

WebView-оболочка над мобильным клиентом `/mobile`. Готовый APK в этой среде не собирается: нет Android SDK и JDK. Исходники готовы к сборке на машине с Android Studio.

## Что получится

- приложение `ru.slot.booking`
- открывает страницу `/mobile` на весь экран
- работает как обычное Android-приложение, без Telegram

## Сборка APK

1. Установите [Android Studio](https://developer.android.com/studio) (JDK 17, Android SDK 34).
2. Скопируйте папку `android/` на компьютер.
3. В `app/src/main/java/ru/slot/booking/MainActivity.kt` замените `DEFAULT_URL` на публичный https-адрес вашего деплоя, например `https://your-domain.com/mobile`.
4. Соберите debug APK:

```bash
cd android
./gradlew assembleDebug
```

APK появится в `app/build/outputs/apk/debug/app-debug.apk`.

Для установки на телефон:

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Важно

- На Android 8+ неизвестные источники: Настройки → Безопасность → Установка из этого источника.
- Для production нужен свой keystore и `assembleRelease`.
- Локальный `localhost` с телефона недоступен — нужен публичный URL.
