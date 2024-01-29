FROM alpine:latest

RUN apk update && \
    apk add --no-cache curl gcc libc-dev

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

ENV PATH="/root/.cargo/bin:${PATH}"
ENV USER=root