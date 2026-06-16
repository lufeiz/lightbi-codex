FROM golang:1.22-alpine AS build

WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/lightbi-server ./cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
  && addgroup -S lightbi \
  && adduser -S lightbi -G lightbi

WORKDIR /app
COPY --from=build /out/lightbi-server /usr/local/bin/lightbi-server
USER lightbi
EXPOSE 8080

CMD ["lightbi-server"]
