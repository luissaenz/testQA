# TestQA App

Aplicación mínima para probar el pipeline de previews de Coolify con el orquestador de tests E2E.

## Endpoints

- `GET /` - mensaje de bienvenida
- `GET /health` - health-check
- `GET /login` - simula una página de login para los tests

## Uso con Coolify

1. Subí este contenido a un repositorio privado en GitHub.
2. En Coolify, creá un recurso desde **Private Repository (with GitHub App)**.
3. Habilitá **Preview Deployments**.
4. Configurá el webhook `deployment.success` apuntando al orquestador.
5. Creá una rama con identificador de Linear, por ejemplo:
   ```bash
   git checkout -b TP-123/test-initial
   git push origin TP-123/test-initial
   ```
6. En Coolify, deployá el preview de esa rama.

## Variables de entorno

- `PORT` - puerto (default: 3000)
- `NODE_ENV` - entorno (default: development)
- `BRANCH` - nombre de la rama
- `COMMIT_SHA` - hash del commit
