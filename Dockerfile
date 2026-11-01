# Usamos la imagen oficial de Tatum KMS, que ya contiene todo lo necesario
FROM tatumio/tatum-kms:latest

# El comando que se ejecutará al iniciar el contenedor.
# 'daemon' inicia el servicio en segundo plano para que firme transacciones.
# Opcional: Puedes añadir --external-url para el "Four-Eye Principle" (ver más abajo).
CMD ["daemon", "--period", "10"]
