FROM maven:3.9.9-eclipse-temurin-17@sha256:f58d59b6273e785ac0a4477f6e9b5ba1d7731c75b906c0f7b34076f1851318cc AS build
WORKDIR /app

COPY pom.xml .
RUN mvn -q -DskipTests dependency:resolve

COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre-alpine@sha256:02320dd4ce20e243dfb915c686089cf9315c763084fafbb12d5c9993aee18b57
WORKDIR /app

RUN apk upgrade --no-cache libexpat p11-kit p11-kit-trust \
  && addgroup -S app \
  && adduser -S app -G app
COPY --from=build /app/target/swap-backend-*.jar /app/swap-backend.jar

USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

ENTRYPOINT ["java", "-jar", "/app/swap-backend.jar"]
