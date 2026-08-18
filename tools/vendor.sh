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

	# Шрифты. Раньше они подключались из styles.css через @import с
	# fonts.googleapis.com — и на сервере этот запрос молча резал собственный
	# CSP «style-src 'self'». Архив открывался Georgia и системным шрифтом.
	#
	# Здесь лежат вариативные начертания: один файл на подмножество покрывает
	# все веса от 400 до 700, поэтому четырёх файлов хватает вместо двенадцати.
	# Кириллица и латиница разнесены — браузер возьмёт только нужное.
	"https://fonts.gstatic.com/s/bitter/v42/rax8HiqOu8IVPmn7e4xpPDk.woff2|bitter-cyrillic.woff2|8Z1rl76p384Mk0GmO3cVHqplISDaPOJzWXgtvosDmeD57wlXPecOwQePJEOnOV7Z"
	"https://fonts.gstatic.com/s/bitter/v42/rax8HiqOu8IVPmn7f4xp.woff2|bitter-latin.woff2|CZfR0RSywEq+ChkgIpU/aFDWYH5e/EuXCbDzqKWovK6wF2/eRgHKUtWxmeqAgEhl"
	"https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggOxSuXd.woff2|manrope-cyrillic.woff2|9M7obleQp6vp9t0NTVbNRsvYD2pn4z782Psnjr2ffb/RbAfzUvYYmSB/B0R1KYVS"
	"https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggexSg.woff2|manrope-latin.woff2|W79Yofbmmadvp+YsnJL6r3n/TAZn+CxkbqarghOLqHLHGPWjiLFWJya74m1EbqtA"
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
