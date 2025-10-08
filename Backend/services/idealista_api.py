import requests
import os
import time
from dotenv import load_dotenv

load_dotenv()

class IdealistaAPI:
    def __init__(self):
        self.api_key = os.getenv("IDEALISTA_API_KEY")
        self.secret = os.getenv("IDEALISTA_SECRET")
        self.token = None
    
    def get_access_token(self):
        try:
            auth = requests.auth.HTTPBasicAuth(self.api_key, self.secret)
            response = requests.post(
                "https://api.idealista.com/oauth/token",
                data={'grant_type': 'client_credentials'},
                auth=auth
            )
            response.raise_for_status()
            self.token = response.json()['access_token']
            return self.token
        except Exception as e:
            print(f"Error obteniendo token: {e}")
            return None
    
    def search_properties(self, location="madrid", operation="rent", property_type="homes", max_items=50):
        if not self.token:
            if not self.get_access_token():
                return {"error": "No se pudo obtener token de acceso"}
        
        headers = {'Authorization': f'Bearer {self.token}'}
        params = {
            'country': 'es',
            'operation': operation,
            'propertyType': property_type,
            'locationId': '0-EU-ES-28',  # Madrid
            'maxItems': max_items,
            'numPage': 1,
            'locale': 'es'
        }
        
        try:
            response = requests.post(
                "https://api.idealista.com/3.5/es/search",
                headers=headers,
                data=params
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error en la petición a Idealista: {e}")
            return {"error": str(e)}