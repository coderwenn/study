# 管理后台后端镜像：多阶段构建（Maven 编译 + JRE 运行）
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
# 先拷 pom.xml，利用 Docker 层缓存
COPY pom.xml .
RUN mvn dependency:go-offline -B
# 拷源码并构建
COPY src ./src
RUN mvn package -DskipTests -B

# ---- 运行阶段 ----
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/admin-backend-0.1.0.jar app.jar
EXPOSE 8081
# 运行时由 docker-compose / .env 覆盖配置
CMD ["java", "-jar", "app.jar"]
