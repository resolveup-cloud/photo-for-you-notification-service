# CI e publicação migrados

`resolveup-cloud.yaml` executa a qualidade completa e publica automaticamente na branch principal. O recibo real em `migration.json` confirma imagem imutável por SHA, alias `latest` e digest remoto idêntico. A publicação é apenas de imagem; não declara saúde nem altera os serviços privados.

`ci-cd.yml` é uma cópia exata do Action desativado. O workflow manual `build-artifact.yml` permanece ativo até existir exportação de arquivo OCI pela Cloud.
