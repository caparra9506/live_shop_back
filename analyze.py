import sys
from transformers import pipeline

# Cargar el modelo de clasificación de sentimientos en español
classifier = pipeline("sentiment-analysis", model="nlptown/bert-base-multilingual-uncased-sentiment")

# Leer el texto pasado como argumento desde NestJS
text = sys.argv[1]

# Analizar el comentario
result = classifier(text)

# Devolver solo la clasificación y el puntaje
print(result[0]['label'], result[0]['score'])
