.PHONY: build clean install

build:
	bun run build
	go build -o ../bin/agy-viewer .
	@echo "→ ../bin/agy-viewer"

install: build
	cp ../bin/agy-viewer /usr/local/bin/agy-viewer
	systemctl restart agy-bridge-viewer
	@echo "installed + service restarted"

clean:
	rm -rf dist ../bin/agy-viewer
