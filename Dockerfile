# DesignExplorer - Static frontend served by NGINX (rootless)
# No build step needed - just copy static files

FROM nginx:1.27-alpine

# Copy static files to nginx html directory
COPY --chown=nginx:nginx . /usr/share/nginx/html

# Copy nginx configs (ROOTLESS versions)
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Pre-create writable dirs for non-root runtime
RUN mkdir -p /tmp/nginx/{client_temp,proxy_temp,fastcgi_temp,uwsgi_temp,scgi_temp} \
    && chown -R nginx:nginx /tmp/nginx /usr/share/nginx/html \
    && chmod -R u+rwX /tmp/nginx /usr/share/nginx/html

# Optional: curl for healthcheck
RUN apk add --no-cache curl

# Expose non-privileged port
EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:8080/health || exit 1

# Drop privileges
USER nginx

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
