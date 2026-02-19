import unicodedata


DEFAULT_CANONICAL_COMPLAINT_TYPES = [
    'Assedio moral',
    'Assedio sexual',
    'Discriminacao',
    'Conduta antietica',
    'Violencia psicologica',
    'Outro',
]


def normalize_complaint_label(label: str) -> str:
    text = unicodedata.normalize('NFKD', (label or '').strip())
    text = ''.join(char for char in text if not unicodedata.combining(char))
    text = ' '.join(text.split()).lower()
    return text
