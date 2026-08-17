#!/usr/bin/env bash
# Локальные копии зависимостей в vendor/.
#
#   ./tools/vendor.sh                  # рядом с index.html
#   ./tools/vendor.sh /srv/gen-tree/app
#
# Зачем: снимает зависимость от unpkg и jsdelivr (чужая сеть — чужая доступность),
# позволяет включить строгий CSP «default-src 'self'» и убирает утечку адресов
# посетителей семейного архива на сторонние CDN.
#
# Каталог vendor/ намеренно не хранится в репозитории: это чужой код, у него свои
# версии и лицензии. Файлы проверяются по тем же хэшам SHA-384, что стояли в
# атрибутах integrity в index.html.
set -euo pipefail

APP="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
DEST="$APP/vendor"
mkdir -p "$DEST"

# url|файл|sha384-base64 («-» = хэш не публикуется, проверяется только загрузка)
FILES=(
	"https://unpkg.com/react@18.3.1/umd/react.production.min.js|react.production.min.js|DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z"
	"https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js|react-dom.production.min.js|gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1"
	"https://unpkg.com/d3@7.9.0/dist/d3.min.js|d3.min.js|CjloA8y00+1SDAUkjs099PVfnY2KmDC2BZnws9kh8D/lX1s46w6EPhpXdqMfjK6i"
	"https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js|topojson-client.min.js|Ukv1p/xTma6P4/2bY5KzWBw+ydSpXmhCMtyciIQVDJ1RmOxtCYNMF1uXT9T63H67"
	"https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json|countries-110m.json|-"
)

for entry in "${FILES[@]}"; do
	IFS="|" read -r url name want <<<"$entry"
	tmp="$DEST/.$name.part"
	printf '  %-32s' "$name"
	curl -fsSL "$url" -o "$tmp"

	if [ "$want" != "-" ]; then
		got="$(openssl dgst -sha384 -binary "$tmp" | openssl base64 -A)"
		if [ "$got" != "$want" ]; then
			rm -f "$tmp"
			echo "ХЭШ НЕ СОВПАЛ"
			echo "    ожидался: $want" >&2
			echo "    получен:  $got" >&2
			exit 1
		fi
	fi

	mv "$tmp" "$DEST/$name"
	echo "$(du -h "$DEST/$name" | cut -f1)"
done

echo "Зависимости на месте: $DEST"
