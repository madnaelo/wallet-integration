FROM maven:3.9-eclipse-temurin-26@sha256:b2c1ad85954592f9928e84327c65201f308ad9b5d8ed7d5b823717c97bf23fbb AS build
WORKDIR /app

COPY pom.xml .
RUN mvn -q -DskipTests dependency:resolve

COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre-alpine@sha256:27cc0849148c0fd32ee8e95988917becf9bc96a3182a24f99d9763aa8e90f8cb AS runtime
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
