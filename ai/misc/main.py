import sys
import os

# Get the absolute path to the project root
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

from ai.ai import train_ai

def main():
    if (len(sys.argv) != 2):
        return print("Please provide a saved AI!")
    
    save_file = sys.argv[1]
    train_ai(save_file)

if __name__ == "__main__":
    main()