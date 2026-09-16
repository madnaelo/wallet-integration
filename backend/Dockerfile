FROM maven:3.9.9-eclipse-temurin-17@sha256:f58d59b6273e785ac0a4477f6e9b5ba1d7731c75b906c0f7b34076f1851318cc AS build
WORKDIR /app

COPY pom.xml .
RUN mvn -q -DskipTests dependency:resolve

COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:25-jre-alpine@sha256:3137541deb3cac6626b5d9a4a2187bc0d6a34312f858bd2c67dd01e732e6b682
WORKDIR /app

RUN apk upgrade --no-cache libexpat p11-kit p11-kit-trust openssl libcrypto3 libssl3 sqlite-libs \
  && addgroup -S app \
  && adduser -S app -G app
COPY --from=build /app/target/swap-backend-*.jar /app/swap-backend.jar

USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

ENTRYPOINT ["java", "-jar", "/app/swap-backend.jar"]
