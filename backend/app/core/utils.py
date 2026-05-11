import unicodedata
import difflib

def normalize_string(s: str) -> str:
    if not s:
        return ""
    # Normalize to NFD to separate characters from accents
    s = str(s)
    s = unicodedata.normalize('NFD', s)
    # Filter out non-spacing mark characters (accents)
    s = "".join([c for c in s if unicodedata.category(c) != 'Mn'])
    return s.lower().strip()

def fuzzy_match(str1: str, str2: str, threshold: float = 0.8) -> bool:
    s1 = normalize_string(str1)
    s2 = normalize_string(str2)
    
    if not s1 or not s2:
        return False
        
    # Check if one is contained in the other
    if s1 in s2 or s2 in s1:
        return True
        
    # Use difflib for similarity ratio
    ratio = difflib.SequenceMatcher(None, s1, s2).ratio()
    return ratio >= threshold
