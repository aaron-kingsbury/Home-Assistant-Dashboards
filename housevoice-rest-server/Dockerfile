ARG BUILD_FROM

FROM golang:1.26-alpine AS builder
RUN CGO_ENABLED=0 go install github.com/restic/rest-server/cmd/rest-server@v0.14.0

FROM ${BUILD_FROM}

RUN apk add --no-cache \
    bash \
    jq \
    nginx \
    openssl \
    restic \
    tzdata

COPY --from=builder /go/bin/rest-server /usr/local/bin/rest-server
COPY client-ca.crt /etc/housevoice/client-ca.crt
COPY rootfs /

RUN chmod 0755 /etc/services.d/housevoice-rest-server/run

CMD ["/init"]
