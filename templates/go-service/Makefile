.PHONY: test test-cover check-coverage vet fmt

vet:
	go vet ./...

fmt:
	gofmt -l -w src

test:
	go test ./...

test-cover:
	go test ./... -coverprofile=coverage.out -covermode=count

check-coverage:
	go test ./... -coverprofile=coverage.out -covermode=count
	@go tool cover -func=coverage.out | awk -F'\t' '/^total:/ {gsub(/%/, "", $$NF); if ($$NF + 0 < 90) { print "ERROR: coverage " $$NF "% is below 90% threshold"; exit 1 } else { print "OK: coverage " $$NF "%" } }'
