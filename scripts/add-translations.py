"""Voegt vertalingen toe aan src/lib/i18n/dictionary.ts.

Gebruik vanuit een ander script:
    from importlib.machinery import SourceFileLoader
    add = SourceFileLoader("add", "scripts/add-translations.py").load_module().add
    add({"key": ("Nederlands", "English"), ...}, section="Agenda")
"""
import io

PATH = "src/lib/i18n/dictionary.ts"


def add(entries, section=None):
    text = io.open(PATH, encoding="utf-8").read()

    nl_lines, en_lines = [], []
    if section:
        header = "\n  /* --- %s %s */\n" % (section, "-" * max(3, 66 - len(section)))
        nl_lines.append(header)
        en_lines.append("\n")

    for key, (nl_value, en_value) in entries.items():
        if '"%s":' % key in text:
            raise SystemExit("sleutel bestaat al: %s" % key)
        nl_lines.append('  "%s": %s,\n' % (key, json_str(nl_value)))
        en_lines.append('  "%s": %s,\n' % (key, json_str(en_value)))

    marker_nl = "} as const;"
    at = text.index(marker_nl)
    text = text[:at] + "".join(nl_lines) + text[at:]

    marker_en = "\n};\n\nconst TABLES"
    at = text.index(marker_en)
    text = text[:at] + "\n" + "".join(en_lines).rstrip("\n") + text[at:]

    io.open(PATH, "w", encoding="utf-8").write(text)
    print("toegevoegd: %d sleutels" % len(entries))


def json_str(value):
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return '"%s"' % escaped
