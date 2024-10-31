import React, { useEffect, useState } from 'react';
import axios from 'axios';

const FetchData = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    axios.get('http://localhost:5000/api/data')
      .then(response => {
        setData(response.data.message);
      })
      .catch(error => {
        console.error("There was an error fetching the data!", error);
      });
  }, []);

  return (
    <div>
      {data ? <p>{data}</p> : <p>Loading...</p>}
    </div>
  );
};

export default FetchData;
