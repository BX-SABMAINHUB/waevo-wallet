FROM tatumio/tatum-kms:latest

# Añadimos el flag --external-url con la URL de validación de tu app en Vercel
CMD ["daemon", "--period", "10", "--external-url", "https://waevo-wallet.vercel.app/api/validate-transaction"]
