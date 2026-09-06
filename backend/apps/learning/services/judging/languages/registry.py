from . import python_lang, javascript_lang, java_lang, cpp_lang, c_lang

_LANGUAGES = {
    "python": python_lang,
    "javascript": javascript_lang,
    "java": java_lang,
    "cpp": cpp_lang,
    "c": c_lang,
}


def get_language(name):
    try:
        return _LANGUAGES[name]
    except KeyError:
        raise ValueError(f"Unsupported language {name!r}. Supported: {sorted(_LANGUAGES)}")


def supported_languages():
    return sorted(_LANGUAGES)
