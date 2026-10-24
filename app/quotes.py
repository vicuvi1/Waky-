"""One quote per day: Spartans (as recorded by Plutarch and Herodotus) and the Stoics.

Translations are public domain (e.g. George Long's Marcus Aurelius), lightly modernised.
"""

QUOTES = [
    ("In the morning, when you rise unwillingly, let this thought be present: I am rising to the work of a human being.",
     "Marcus Aurelius", "Meditations"),
    ("Come back with your shield, or on it.", "A Spartan mother to her son", "Plutarch"),
    ("No longer talk about what a good man should be. Be one.", "Marcus Aurelius", "Meditations"),
    ("While we postpone, life speeds by.", "Seneca", "Letters"),
    ("First say to yourself what you would be; then do what you have to do.", "Epictetus", "Discourses"),
    ("Men wear helmets and breastplates for their own sake, but the shield for the sake of the whole line.",
     "Demaratus of Sparta", "Plutarch"),
    ("What stands in the way becomes the way.", "Marcus Aurelius", "Meditations"),
    ("It is not that we have a short time to live, but that we waste a lot of it.", "Seneca", "On the Shortness of Life"),
    ("No great thing is created suddenly.", "Epictetus", "Discourses"),
    ("Then we will fight in the shade.", "Dienekes, told the Persian arrows would hide the sun", "Herodotus"),
    ("How long will you wait before you demand the best of yourself?", "Epictetus", "Enchiridion"),
    ("Do every act of your life as if it were the last.", "Marcus Aurelius", "Meditations"),
    ("Begin at once to live, and count each separate day as a separate life.", "Seneca", "Letters"),
    ("These are the walls of Sparta.", "King Agesilaus, pointing to his citizens", "Plutarch"),
    ("We suffer more often in imagination than in reality.", "Seneca", "Letters"),
    ("No man is free who is not master of himself.", "Epictetus", "Fragments"),
    ("Molon labe. Come and take them.", "King Leonidas, told to hand over his weapons", "Plutarch"),
    ("The soul is dyed by its thoughts.", "Marcus Aurelius", "Meditations"),
    ("Men are disturbed not by things, but by the views they take of things.", "Epictetus", "Enchiridion"),
    ("The Spartans do not ask how many the enemy are, but where they are.", "King Agis", "Plutarch"),
    ("As long as you live, keep learning how to live.", "Seneca", "Letters"),
    ("If it is not right, do not do it. If it is not true, do not say it.", "Marcus Aurelius", "Meditations"),
    ("If.", "The Spartans' whole reply to King Philip's threat to destroy them", "Plutarch"),
    ("Confine yourself to the present.", "Marcus Aurelius", "Meditations"),
    ("We are what we repeatedly do.", "Will Durant, summing up Aristotle", "The Story of Philosophy"),
    ("It is impossible to learn what you think you already know.", "Epictetus", "Discourses"),
]


def quote_for(day):
    text, who, source = QUOTES[day.toordinal() % len(QUOTES)]
    return {"text": text, "who": who, "source": source}
