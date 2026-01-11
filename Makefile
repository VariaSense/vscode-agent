build:
	npm run compile

package: build
	npx vsce package