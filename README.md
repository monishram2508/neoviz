# neo4-to-html (NtH): Neo4j Query Visualization Tool

## Overview
NtH is a web-based tool that allows users to execute Neo4j Cypher queries and visualize the results dynamically. Designed for researchers, developers, and data analysts, NtH simplifies graph database exploration by providing an intuitive and interactive interface.

## Features
- Execute **Neo4j Cypher queries** directly from the UI
- Visualize **nodes and relationships** in an interactive graph
- Supports **incoming and outgoing relationships**
- **Dynamic menu generation** based on relationships
- Uses **React** for the frontend and **Express.js** for backend query handling

## Prerequisites
- **Node.js** (v14 or higher recommended)
- **Neo4j Database** (AuraDB)
- **npm** for dependency management

## Installation
1. Clone the repository:
   ```sh
   git clone https://github.com/g-r-w99/neo4j-to-html.git
   cd neo4j-to-html
   ```
2. Install dependencies:
   ```sh
   Backend:
   cd backend
   npm install dotenv
   npm install express neo4j-driver cors
   ```
   ```sh
   Frontend:
   cd frontend
   npm install
   npm install neo4j-driver    
   ```

## Usage
### Start the Backend Server
Before starting the backend, set the JWT secret in the terminal:
```
export JWT_SECRET=your_secret_key_here
```
Then run the Express.js server:
```sh
   cd backend
   node index.js   
```

### Start the Frontend
Run the React application:
```sh
   cd frontend
   npm start
```
The application will be available at `http://localhost:3000`



## Contributing
1. Fork the repository
2. Create a new branch (`git checkout -b feature-branch`)
3. Commit your changes (`git commit -m "Add new feature"`)
4. Push to the branch (`git push origin feature-branch`)
5. Open a Pull Request


## Tech Stack
- **Frontend:** React, D3.js, CSS
- **Backend:** Express.js, Neo4j Driver
- **Database:** Neo4j (AuraDB or self-hosted)


