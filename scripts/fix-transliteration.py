#!/usr/bin/env python3
import json
import os
from pathlib import Path

works_dir = Path('/Users/chad/Dropbox/Public/JS/Projects/websites/CTAI/src/content/works')

def fix_transliteration(obj):
    """Fix transliteration in a JSON object"""
    if isinstance(obj, dict):
        for key, value in obj.items():
            if isinstance(value, str):
                # Fix author field - Mazindarani
                if key == 'author' and 'Fáḍil Mázindarání' in value:
                    obj[key] = value.replace('Fáḍil Mázindarání', 'Fáḍil-i-Mázindarání')
                # Fix author field - Davudi (straight apostrophe before A = ayn)
                if key == 'author' and "'Alí-Murád Dávúdí" in value:
                    obj[key] = value.replace("'Alí-Murád Dávúdí", "ʻAlí-Murád Dávúdí")
                # Fix author field - Sulaymani
                if key == 'author' and "'Azízu'lláh Sulaymání" in value:
                    obj[key] = value.replace("'Azízu'lláh Sulaymání", "ʻAzízu'lláh Sulaymání")
                # Fix author field - Bushrui
                if key == 'author' and "Fu'ádí Bushrú'í" in value:
                    obj[key] = value.replace("Fu'ádí Bushrú'í", "Fuʼádí Bushrúʼí")
                # Fix author field - Abdul-Baha
                if key == 'author' and "'Abdu'l-Bahá" in value:
                    obj[key] = value.replace("'Abdu'l-Bahá", "ʻAbdu'l-Bahá")
                # Fix title field - Asraru'l-Athar
                if key == 'title' and "Asraru'l-Athar" in value:
                    obj[key] = value.replace("Asraru'l-Athar", "Asráru'l-Áthár")
                # Fix title field - Zuhuru'l-Haqq
                if key == 'title' and "Zuhuru'l-Haqq" in value:
                    obj[key] = value.replace("Zuhuru'l-Haqq", "Ẓuhúru'l-Ḥaqq")
                    obj[key] = obj[key].replace("Tarikh", "Táríkh")
                # Fix description/author_bio - Mazindarani possessive
                if key in ['description', 'author_bio']:
                    if 'Mázindarání\'s five-volume' in value:
                        obj[key] = value.replace("Mázindarání's five-volume", "Fáḍil-i-Mázindarání's five-volume")
                    if 'Mázindarání\'s nine-volume' in value:
                        obj[key] = value.replace("Mázindarání's nine-volume", "Fáḍil-i-Mázindarání's nine-volume")
                    if 'Mázindarání\'s monumental' in value:
                        obj[key] = value.replace("Mázindarání's monumental", "Fáḍil-i-Mázindarání's monumental")
                    if 'Fáḍil Mázindarání (' in value:
                        obj[key] = value.replace('Fáḍil Mázindarání (', 'Fáḍil-i-Mázindarání (')
                # Fix title_english
                if key == 'title_english' and 'Secrets of the Traces' in value:
                    obj[key] = value.replace('Secrets of the Traces', 'Secrets of the Sacred Traces')
    return obj

fixed_count = 0

for json_file in works_dir.rglob('*.json'):
    with open(json_file, 'r', encoding='utf-8') as f:
        content = f.read()
        original = content
        data = json.loads(content)

    data = fix_transliteration(data)

    new_content = json.dumps(data, ensure_ascii=False, indent=2) + '\n'

    if new_content != original:
        with open(json_file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Fixed: {json_file}')
        fixed_count += 1

print(f'\nTotal files fixed: {fixed_count}')
